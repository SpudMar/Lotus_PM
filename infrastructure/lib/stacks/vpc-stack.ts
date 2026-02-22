import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { getConfig } from '../config'

interface VpcStackProps extends cdk.StackProps {
  environment: string
}

export class LotusPmVpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly dbSecurityGroup: ec2.SecurityGroup
  public readonly cacheSecurityGroup: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props)

    const config = getConfig(props.environment)

    // ── VPC ─────────────────────────────────────────────────────────
    // 2 AZs — simple and cost-effective for current scale (REQ-006)
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `lotus-pm-${props.environment}`,
      maxAzs: 2,
      natGateways: props.environment === 'production' ? 2 : 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    })

    // ── Security Groups ─────────────────────────────────────────────
    // ECS and ALB security groups are created by ApplicationLoadBalancedFargateService
    // in the app stack — defining them here would create cross-stack cyclic references.
    // RDS and Redis SGs use VPC CIDR ingress to accept traffic from any ECS task
    // in the private subnets (10.0.0.0/8 range).

    // RDS: accepts PostgreSQL from private subnet CIDR
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'RDS PostgreSQL - receives traffic from ECS private subnets',
      allowAllOutbound: false,
    })
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'PostgreSQL from VPC'
    )

    // Redis: accepts connections from private subnet CIDR
    this.cacheSecurityGroup = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc: this.vpc,
      description: 'ElastiCache Redis - receives traffic from ECS private subnets',
      allowAllOutbound: false,
    })
    this.cacheSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Redis from VPC'
    )

    // ── Outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `lotus-pm-${props.environment}-vpc-id`,
    })

    // Tag everything
    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', props.environment)
    cdk.Tags.of(this).add('ManagedBy', 'cdk')

    // Suppress unused var warning
    void config
  }
}
