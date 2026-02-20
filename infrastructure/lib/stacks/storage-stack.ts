import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as events from 'aws-cdk-lib/aws-events'
import * as ses from 'aws-cdk-lib/aws-ses'
import * as sesActions from 'aws-cdk-lib/aws-ses-actions'
import { Construct } from 'constructs'

interface StorageStackProps extends cdk.StackProps {
  environment: string
}

export class LotusPmStorageStack extends cdk.Stack {
  public readonly invoiceBucket: s3.Bucket
  public readonly documentBucket: s3.Bucket
  public readonly invoiceQueue: sqs.Queue
  public readonly notificationQueue: sqs.Queue
  public readonly eventBus: events.EventBus

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props)

    const env = props.environment

    // ── S3: Invoice Storage ─────────────────────────────────────────
    // REQ-016: server-side encryption (AES-256)
    // REQ-011: stays in ap-southeast-2 (bucket created in stack region)
    // REQ-010: 5-year retention for invoices/payments
    this.invoiceBucket = new s3.Bucket(this, 'InvoiceBucket', {
      bucketName: `lotus-pm-invoices-${env}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,   // SSE-S3 AES-256
      enforceSSL: true,                               // REQ-016: in-transit
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: env === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== 'production',
      lifecycleRules: [
        {
          // REQ-010: 5-year retention for invoices
          // Move to IA after 90 days, Glacier after 1 year
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
          // Never auto-delete — manual process for compliance
        },
      ],
    })

    // ── S3: Document Storage ────────────────────────────────────────
    this.documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: `lotus-pm-documents-${env}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: env === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== 'production',
    })

    // ── SQS: Dead Letter Queues ─────────────────────────────────────
    const invoiceDlq = new sqs.Queue(this, 'InvoiceDlq', {
      queueName: `lotus-pm-invoice-dlq-${env}`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
    })

    const notificationDlq = new sqs.Queue(this, 'NotificationDlq', {
      queueName: `lotus-pm-notification-dlq-${env}`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
    })

    // ── SQS: Invoice Processing Queue ──────────────────────────────
    // REQ-007: 2,000-10,000 invoices/month — async processing via SQS
    this.invoiceQueue = new sqs.Queue(this, 'InvoiceQueue', {
      queueName: `lotus-pm-invoice-queue-${env}`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(300),  // 5 min processing window
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: invoiceDlq,
        maxReceiveCount: 3,
      },
    })

    // ── SQS: Notification Queue ─────────────────────────────────────
    this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: `lotus-pm-notification-queue-${env}`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(1),
      deadLetterQueue: {
        queue: notificationDlq,
        maxReceiveCount: 3,
      },
    })

    // ── EventBridge: Custom Event Bus ──────────────────────────────
    // Modules communicate via events — never direct imports (CLAUDE.md)
    this.eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: 'lotus-pm-events',
    })

    // ── Outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'InvoiceBucketName', {
      value: this.invoiceBucket.bucketName,
      exportName: `lotus-pm-${env}-invoice-bucket`,
    })
    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: this.documentBucket.bucketName,
      exportName: `lotus-pm-${env}-document-bucket`,
    })
    new cdk.CfnOutput(this, 'InvoiceQueueUrl', {
      value: this.invoiceQueue.queueUrl,
      exportName: `lotus-pm-${env}-invoice-queue-url`,
    })
    new cdk.CfnOutput(this, 'NotificationQueueUrl', {
      value: this.notificationQueue.queueUrl,
      exportName: `lotus-pm-${env}-notification-queue-url`,
    })
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      exportName: `lotus-pm-${env}-event-bus`,
    })

    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', env)
    cdk.Tags.of(this).add('ManagedBy', 'cdk')
  }
}
