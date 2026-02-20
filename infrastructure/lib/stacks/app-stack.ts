import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { Construct } from 'constructs'
import { getConfig } from '../config'

interface AppStackProps extends cdk.StackProps {
  environment: string
  vpc: ec2.Vpc
  appSecurityGroup: ec2.SecurityGroup
  albSecurityGroup: ec2.SecurityGroup
  db: rds.DatabaseInstance
  dbSecret: secretsmanager.ISecret
  invoiceBucket: s3.Bucket
  documentBucket: s3.Bucket
  invoiceQueue: sqs.Queue
  notificationQueue: sqs.Queue
}

export class LotusPmAppStack extends cdk.Stack {
  public readonly fargateService: ecsPatterns.ApplicationLoadBalancedFargateService

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const config = getConfig(props.environment)
    const env = props.environment

    // ── ECS Cluster ─────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `lotus-pm-${env}`,
      vpc: props.vpc,
      containerInsights: true,
    })

    // ── CloudWatch Log Group ─────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: `/lotus-pm/${env}/app`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: env === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    })

    // ── Task IAM Role ────────────────────────────────────────────────
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `lotus-pm-${env}-task-role`,
      description: 'Lotus PM ECS task role — S3, SQS, SES, Textract, EventBridge',
    })

    // S3: read/write invoices and documents
    props.invoiceBucket.grantReadWrite(taskRole)
    props.documentBucket.grantReadWrite(taskRole)

    // SQS: send and receive messages
    props.invoiceQueue.grantSendMessages(taskRole)
    props.invoiceQueue.grantConsumeMessages(taskRole)
    props.notificationQueue.grantSendMessages(taskRole)

    // Textract: invoice AI processing (REQ-007)
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'textract:DetectDocumentText',
        'textract:AnalyzeDocument',
        'textract:StartDocumentAnalysis',
        'textract:GetDocumentAnalysis',
      ],
      resources: ['*'],
    }))

    // SES: send emails (REQ-024)
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }))

    // EventBridge: publish events
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['events:PutEvents'],
      resources: ['*'],
    }))

    // Secrets Manager: read DB credentials and other secrets
    props.dbSecret.grantRead(taskRole)

    // Cognito: user management
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminUpdateUserAttributes',
      ],
      resources: ['*'],
    }))

    // ── Task Definition ──────────────────────────────────────────────
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: `lotus-pm-${env}`,
      cpu: config.taskCpu,
      memoryLimitMiB: config.taskMemoryMiB,
      taskRole,
    })

    // ── App Secret (NEXTAUTH_SECRET etc.) ───────────────────────────
    const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: `lotus-pm/${env}/app-secrets`,
      description: 'Lotus PM application secrets (NEXTAUTH_SECRET, etc.)',
    })
    appSecret.grantRead(taskRole)

    // ── Container ────────────────────────────────────────────────────
    taskDefinition.addContainer('App', {
      image: ecs.ContainerImage.fromRegistry(
        // Placeholder — replaced by CI/CD with ECR image on deploy
        `public.ecr.aws/amazonlinux/amazonlinux:latest`
      ),
      containerName: 'lotus-pm-app',
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup,
      }),
      environment: {
        NODE_ENV: env === 'production' ? 'production' : 'staging',
        AWS_REGION: 'ap-southeast-2',
        NEXTAUTH_URL: `https://${config.subDomain}.${config.domainName}`,
        EVENTBRIDGE_BUS_NAME: 'lotus-pm-events',
        SQS_INVOICE_QUEUE_URL: props.invoiceQueue.queueUrl,
        SQS_NOTIFICATION_QUEUE_URL: props.notificationQueue.queueUrl,
        S3_BUCKET_INVOICES: props.invoiceBucket.bucketName,
        S3_BUCKET_DOCUMENTS: props.documentBucket.bucketName,
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(props.dbSecret, 'dbUrl'),
        NEXTAUTH_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'nextauthSecret'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/api/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    })

    // ── Fargate Service with ALB ─────────────────────────────────────
    this.fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: config.desiredCount,
      publicLoadBalancer: true,
      listenerPort: 443,
      securityGroups: [props.appSecurityGroup],
      loadBalancerName: `lotus-pm-${env}`,
      serviceName: `lotus-pm-${env}`,
      circuitBreaker: { rollback: true },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      // Health check
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    })

    // Health check target group settings
    this.fargateService.targetGroup.configureHealthCheck({
      path: '/api/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    })

    // ── Auto-scaling ─────────────────────────────────────────────────
    const scaling = this.fargateService.service.autoScaleTaskCount({
      minCapacity: config.minCapacity,
      maxCapacity: config.maxCapacity,
    })

    // Scale on CPU (target 70%)
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })

    // Scale on request count
    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 1000,
      targetGroup: this.fargateService.targetGroup,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })

    // ── CloudFront Distribution ──────────────────────────────────────
    // REQ-016: HTTPS only, TLS 1.2+
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: `lotus-pm-${env}`,
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(this.fargateService.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,    // Dynamic app — no caching
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      // Cache static assets
      additionalBehaviors: {
        '/_next/static/*': {
          origin: new origins.LoadBalancerV2Origin(this.fargateService.loadBalancer, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    })

    // ── Outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDns', {
      value: this.fargateService.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name',
    })
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain — point DNS CNAME here for staging',
      exportName: `lotus-pm-${env}-cloudfront-domain`,
    })
    new cdk.CfnOutput(this, 'EcrImagePlaceholder', {
      value: 'Replace container image with ECR URI in CI/CD pipeline',
      description: 'CI/CD pipeline updates this with the built Docker image',
    })

    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', env)
    cdk.Tags.of(this).add('ManagedBy', 'cdk')
  }
}
