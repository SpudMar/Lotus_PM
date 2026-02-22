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
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
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
      description: 'Lotus PM ECS task role - S3, SQS, SES, Textract, EventBridge',
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
    // Scaffold placeholder: nginx responds on port 80 so ECS stabilises immediately.
    // CI/CD replaces this with the real ECR image (port 3000) and re-enables secrets.
    taskDefinition.addContainer('App', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:stable-alpine3.20-slim'),
      containerName: 'lotus-pm-app',
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup,
      }),
      // No secrets injected for placeholder - avoids Secrets Manager key errors
      // CI/CD will add: DB_HOST/PORT/USER/PASSWORD/NAME from RDS secret + NEXTAUTH_SECRET
      environment: {
        DB_SECRET_ARN: props.dbSecret.secretArn,
        APP_SECRET_ARN: appSecret.secretArn,
      },
    })

    // ── Fargate Service with ALB ─────────────────────────────────────
    this.fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: config.desiredCount,
      publicLoadBalancer: true,
      // Port 80 for scaffold (nginx placeholder); CI/CD switches to 443 + ACM cert
      listenerPort: 80,
      loadBalancerName: `lotus-pm-${env}`,
      serviceName: `lotus-pm-${env}`,
      // Circuit breaker disabled for initial deploy (placeholder image has no app on :3000)
      // Re-enable once real ECR image is in place via CI/CD
      // circuitBreaker: { rollback: true },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    })

    // Health check: nginx returns 200 on / - CI/CD updates to /api/health on port 3000
    this.fargateService.targetGroup.configureHealthCheck({
      path: '/',
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
          // HTTP_ONLY for scaffold (port 80); CI/CD switches back to HTTPS_ONLY + ACM cert
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
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
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
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
      description: 'CloudFront domain - point DNS CNAME here for staging',
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
