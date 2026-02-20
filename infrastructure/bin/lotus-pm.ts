#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { LotusPmVpcStack } from '../lib/stacks/vpc-stack'
import { LotusPmDatabaseStack } from '../lib/stacks/database-stack'
import { LotusPmStorageStack } from '../lib/stacks/storage-stack'
import { LotusPmAppStack } from '../lib/stacks/app-stack'
import { LotusPmCacheStack } from '../lib/stacks/cache-stack'
import { LotusPmMonitoringStack } from '../lib/stacks/monitoring-stack'

const app = new cdk.App()

// Environment from context — default to staging
const environment = app.node.tryGetContext('environment') as string ?? 'staging'

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: 'ap-southeast-2', // REQ-001: Sydney ONLY
}

const prefix = `lotus-pm-${environment}`

// ── Stack 1: VPC & Networking ──────────────────────────────────────
const vpcStack = new LotusPmVpcStack(app, `${prefix}-vpc`, {
  env,
  environment,
  description: 'Lotus PM — VPC, subnets, security groups',
})

// ── Stack 2: Database (RDS PostgreSQL) ─────────────────────────────
const dbStack = new LotusPmDatabaseStack(app, `${prefix}-database`, {
  env,
  environment,
  vpc: vpcStack.vpc,
  dbSecurityGroup: vpcStack.dbSecurityGroup,
  description: 'Lotus PM — RDS PostgreSQL (financial data)',
})
dbStack.addDependency(vpcStack)

// ── Stack 3: Storage (S3, SES, SQS, EventBridge) ──────────────────
const storageStack = new LotusPmStorageStack(app, `${prefix}-storage`, {
  env,
  environment,
  description: 'Lotus PM — S3 buckets, SES, SQS queues, EventBridge',
})

// ── Stack 4: Cache (ElastiCache Redis) ─────────────────────────────
const cacheStack = new LotusPmCacheStack(app, `${prefix}-cache`, {
  env,
  environment,
  vpc: vpcStack.vpc,
  cacheSecurityGroup: vpcStack.cacheSecurityGroup,
  description: 'Lotus PM — ElastiCache Redis (sessions, rate limiting)',
})
cacheStack.addDependency(vpcStack)

// ── Stack 5: App (ECS Fargate) ─────────────────────────────────────
const appStack = new LotusPmAppStack(app, `${prefix}-app`, {
  env,
  environment,
  vpc: vpcStack.vpc,
  appSecurityGroup: vpcStack.appSecurityGroup,
  albSecurityGroup: vpcStack.albSecurityGroup,
  db: dbStack.db,
  dbSecret: dbStack.dbSecret,
  invoiceBucket: storageStack.invoiceBucket,
  documentBucket: storageStack.documentBucket,
  invoiceQueue: storageStack.invoiceQueue,
  notificationQueue: storageStack.notificationQueue,
  description: 'Lotus PM — ECS Fargate app, ALB, CloudFront',
})
appStack.addDependency(vpcStack)
appStack.addDependency(dbStack)
appStack.addDependency(storageStack)
appStack.addDependency(cacheStack)

// ── Stack 6: Monitoring (CloudWatch, alarms) ───────────────────────
const monitoringStack = new LotusPmMonitoringStack(app, `${prefix}-monitoring`, {
  env,
  environment,
  fargateService: appStack.fargateService,
  db: dbStack.db,
  description: 'Lotus PM — CloudWatch dashboards and alarms',
})
monitoringStack.addDependency(appStack)
monitoringStack.addDependency(dbStack)

app.synth()
