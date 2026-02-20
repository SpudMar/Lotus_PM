import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { getConfig } from '../config'

interface VpcStackProps extends cdk.StackProps {
  environment: string
}

export class LotusPmVpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly appSecurityGroup: ec2.SecurityGroup
  public readonly albSecurityGroup: ec2.SecurityGroup
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

    // ALB: accepts HTTPS from anywhere
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'ALB — accepts HTTPS traffic from internet',
      allowAllOutbound: true,
    })
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from internet')
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP (redirect to HTTPS)')

    // App (ECS): only accepts traffic from ALB
    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      description: 'ECS Fargate tasks — receives traffic from ALB only',
      allowAllOutbound: true,
    })
    this.appSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Traffic from ALB'
    )

    // RDS: only accepts traffic from App
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'RDS PostgreSQL — receives traffic from ECS only',
      allowAllOutbound: false,
    })
    this.dbSecurityGroup.addIngressRule(
      this.appSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from ECS'
    )

    // Redis: only accepts traffic from App
    this.cacheSecurityGroup = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc: this.vpc,
      description: 'ElastiCache Redis — receives traffic from ECS only',
      allowAllOutbound: false,
    })
    this.cacheSecurityGroup.addIngressRule(
      this.appSecurityGroup,
      ec2.Port.tcp(6379),
      'Redis from ECS'
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
