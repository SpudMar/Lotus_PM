import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { getConfig } from '../config'

interface DatabaseStackProps extends cdk.StackProps {
  environment: string
  vpc: ec2.Vpc
  dbSecurityGroup: ec2.SecurityGroup
}

export class LotusPmDatabaseStack extends cdk.Stack {
  public readonly db: rds.DatabaseInstance
  public readonly dbSecret: secretsmanager.ISecret

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props)

    const config = getConfig(props.environment)

    // ── DB Credentials (auto-rotated via Secrets Manager) ──────────
    // REQ-016: credentials managed by AWS, never in code or env files
    const dbCredentials = rds.Credentials.fromGeneratedSecret('lotus_pm_admin', {
      secretName: `lotus-pm/${props.environment}/db-credentials`,
    })

    // ── RDS PostgreSQL ──────────────────────────────────────────────
    // REQ-016: storageEncrypted — AES-256 at rest
    // REQ-011: ap-southeast-2 (inherited from stack env)
    const isProduction = props.environment === 'production'

    this.db = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        config.dbInstanceClass as ec2.InstanceClass,
        config.dbInstanceSize as ec2.InstanceSize
      ),
      credentials: dbCredentials,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.dbSecurityGroup],
      databaseName: 'lotus_pm',
      // REQ-016: encryption at rest — not available on db.t3.micro (staging), enabled for production
      storageEncrypted: isProduction,
      multiAz: isProduction,
      // Free tier AWS accounts require backupRetention=0; production uses full retention
      backupRetention: isProduction
        ? cdk.Duration.days(config.backupRetentionDays)
        : cdk.Duration.days(0),
      deletionProtection: config.deletionProtection,
      // Performance Insights not available on db.t3.micro (staging)
      enablePerformanceInsights: isProduction,
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      autoMinorVersionUpgrade: true,
      removalPolicy: isProduction
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.SNAPSHOT,
      instanceIdentifier: `lotus-pm-${props.environment}`,
    })

    this.dbSecret = this.db.secret!

    // ── Outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.db.dbInstanceEndpointAddress,
      description: 'RDS endpoint',
      exportName: `lotus-pm-${props.environment}-db-endpoint`,
    })

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'DB credentials secret ARN',
      exportName: `lotus-pm-${props.environment}-db-secret-arn`,
    })

    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', props.environment)
    cdk.Tags.of(this).add('DataClassification', 'financial')
    cdk.Tags.of(this).add('ManagedBy', 'cdk')
  }
}
