import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elasticache from 'aws-cdk-lib/aws-elasticache'
import { Construct } from 'constructs'
import { getConfig } from '../config'

interface CacheStackProps extends cdk.StackProps {
  environment: string
  vpc: ec2.Vpc
  cacheSecurityGroup: ec2.SecurityGroup
}

export class LotusPmCacheStack extends cdk.Stack {
  public readonly redisEndpoint: string
  public readonly redisPort: number

  constructor(scope: Construct, id: string, props: CacheStackProps) {
    super(scope, id, props)

    const config = getConfig(props.environment)
    const env = props.environment

    // ── ElastiCache Subnet Group ────────────────────────────────────
    const isolatedSubnets = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    })

    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: `lotus-pm-${env} Redis subnet group`,
      subnetIds: isolatedSubnets.subnetIds,
      cacheSubnetGroupName: `lotus-pm-${env}-redis`,
    })

    // ── ElastiCache Redis Cluster ───────────────────────────────────
    // Used for: sessions, rate limiting, frequently accessed data (CLAUDE.md)
    // REQ-016: at-rest encryption, in-transit encryption
    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `lotus-pm-${env} Redis`,
      replicationGroupId: `lotus-pm-${env}`,
      numCacheClusters: env === 'production' ? 2 : 1,  // Multi-AZ for prod
      cacheNodeType: config.cacheNodeType,
      engine: 'redis',
      engineVersion: '7.1',
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
      securityGroupIds: [props.cacheSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,     // REQ-016
      transitEncryptionEnabled: true,    // REQ-016
      automaticFailoverEnabled: env === 'production',
      multiAzEnabled: env === 'production',
      autoMinorVersionUpgrade: true,
      snapshotRetentionLimit: env === 'production' ? 3 : 1,
    })
    redis.addDependency(subnetGroup)

    this.redisEndpoint = redis.attrPrimaryEndPointAddress
    this.redisPort = 6379

    // ── Outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redis.attrPrimaryEndPointAddress,
      description: 'Redis primary endpoint',
      exportName: `lotus-pm-${env}-redis-endpoint`,
    })

    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', env)
    cdk.Tags.of(this).add('ManagedBy', 'cdk')
  }
}
