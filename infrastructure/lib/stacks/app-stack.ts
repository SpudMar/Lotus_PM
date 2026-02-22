import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
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
  public readonly ecrRepository: ecr.Repository

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const config = getConfig(props.environment)
    const env = props.environment

    // ── ECR Repository ───────────────────────────────────────────────
    // CD pipeline builds Docker image and pushes here on every merge to main
    this.ecrRepository = new ecr.Repository(this, 'EcrRepo', {
      repositoryName: `lotus-pm-${env}`,
      removalPolicy: env === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      // Keep last 10 images; purge untagged after 1 day
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: 'Keep last 10 tagged images',
        },
        {
          maxImageAge: cdk.Duration.days(1),
          tagStatus: ecr.TagStatus.UNTAGGED,
          description: 'Purge untagged images after 1 day',
        },
      ],
    })

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

    // Secrets Manager: read DB credentials and app secrets
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

    // ── Task Execution Role (ECR pull + Secrets Manager) ─────────────
    // CDK creates a default execution role, but we need to grant ECR pull
    // This is handled automatically by fromEcrRepository below

    // ── Task Definition ──────────────────────────────────────────────
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: `lotus-pm-${env}`,
      cpu: config.taskCpu,
      memoryLimitMiB: config.taskMemoryMiB,
      taskRole,
    })

    // Grant ECR pull to the task execution role
    this.ecrRepository.grantPull(taskDefinition.obtainExecutionRole())

    // ── App Secrets (NEXTAUTH_SECRET etc.) ───────────────────────────
    // Populated manually in AWS Secrets Manager before first deploy:
    //   aws secretsmanager put-secret-value \
    //     --secret-id lotus-pm/staging/app-secrets \
    //     --secret-string '{"NEXTAUTH_SECRET":"<random-32-char-string>"}'
    const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: `lotus-pm/${env}/app-secrets`,
      description: 'Lotus PM application secrets (NEXTAUTH_SECRET, etc.)',
    })
    appSecret.grantRead(taskRole)
    appSecret.grantRead(taskDefinition.obtainExecutionRole())
    props.dbSecret.grantRead(taskDefinition.obtainExecutionRole())

    // ── Container ────────────────────────────────────────────────────
    // Uses the ECR image built and pushed by the CD pipeline (cd.yml).
    // The :latest tag is always the most recently deployed image.
    // entrypoint.sh constructs DATABASE_URL from injected secret fields,
    // runs prisma migrate deploy, then starts the Next.js server.
    taskDefinition.addContainer('App', {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository, 'latest'),
      containerName: 'lotus-pm-app',
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup,
      }),
      // Plain env vars
      environment: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        // NEXTAUTH_URL updated to staging.planmanager.lotusassist.com.au after DNS is wired
        NEXTAUTH_URL: `https://d2iv01jt8w4gxn.cloudfront.net`,
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      // Secrets injected from Secrets Manager at container startup
      // entrypoint.sh constructs DATABASE_URL from these individual fields
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(props.dbSecret, 'host'),
        DB_PORT: ecs.Secret.fromSecretsManager(props.dbSecret, 'port'),
        DB_USER: ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        DB_NAME: ecs.Secret.fromSecretsManager(props.dbSecret, 'dbname'),
        NEXTAUTH_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'NEXTAUTH_SECRET'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'wget -qO- http://localhost:3000/api/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        startPeriod: cdk.Duration.seconds(60),
        retries: 3,
      },
    })

    // ── Fargate Service with ALB ─────────────────────────────────────
    this.fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: config.desiredCount,
      publicLoadBalancer: true,
      listenerPort: 80, // Switch to 443 after ACM cert is attached
      loadBalancerName: `lotus-pm-${env}`,
      serviceName: `lotus-pm-${env}`,
      circuitBreaker: { rollback: true },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    })

    // ALB health check: /api/health returns 200 when Next.js is ready
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

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })

    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 1000,
      targetGroup: this.fargateService.targetGroup,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })

    // ── CloudFront Distribution ──────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: `lotus-pm-${env}`,
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(this.fargateService.loadBalancer, {
          // HTTP_ONLY until ACM cert is attached and ALB switches to port 443
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
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
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.ecrRepository.repositoryUri,
      description: 'ECR repository URI - used by CD pipeline to push Docker images',
      exportName: `lotus-pm-${env}-ecr-uri`,
    })

    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', env)
    cdk.Tags.of(this).add('ManagedBy', 'cdk')
  }
}
