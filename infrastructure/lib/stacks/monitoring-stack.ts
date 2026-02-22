import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as rds from 'aws-cdk-lib/aws-rds'
import { Construct } from 'constructs'

interface MonitoringStackProps extends cdk.StackProps {
  environment: string
  fargateService: ecsPatterns.ApplicationLoadBalancedFargateService
  db: rds.DatabaseInstance
}

export class LotusPmMonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props)

    const env = props.environment

    // ── SNS Alert Topic ─────────────────────────────────────────────
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `lotus-pm-${env}-alerts`,
      displayName: `Lotus PM ${env} Alerts`,
    })

    // Add email subscription — update with actual ops email
    alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('alerts@lotusassist.com.au')
    )

    // ── ECS Metrics ─────────────────────────────────────────────────
    const cpuMetric = props.fargateService.service.metricCpuUtilization()
    const memoryMetric = props.fargateService.service.metricMemoryUtilization()

    // CPU alarm: > 80% for 5 minutes
    const cpuAlarm = new cloudwatch.Alarm(this, 'CpuAlarm', {
      alarmName: `lotus-pm-${env}-high-cpu`,
      alarmDescription: 'ECS CPU > 80% for 5 minutes',
      metric: cpuMetric,
      threshold: 80,
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })
    cpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic))

    // Memory alarm: > 85%
    const memoryAlarm = new cloudwatch.Alarm(this, 'MemoryAlarm', {
      alarmName: `lotus-pm-${env}-high-memory`,
      alarmDescription: 'ECS Memory > 85%',
      metric: memoryMetric,
      threshold: 85,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })
    memoryAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic))

    // ── RDS Metrics ─────────────────────────────────────────────────

    // DB CPU alarm: > 80%
    const dbCpuAlarm = new cloudwatch.Alarm(this, 'DbCpuAlarm', {
      alarmName: `lotus-pm-${env}-db-high-cpu`,
      alarmDescription: 'RDS CPU > 80% for 10 minutes',
      metric: props.db.metricCPUUtilization(),
      threshold: 80,
      evaluationPeriods: 10,
      datapointsToAlarm: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })
    dbCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic))

    // DB free storage alarm: < 5GB
    const dbStorageAlarm = new cloudwatch.Alarm(this, 'DbStorageAlarm', {
      alarmName: `lotus-pm-${env}-db-low-storage`,
      alarmDescription: 'RDS free storage < 5GB',
      metric: props.db.metricFreeStorageSpace(),
      threshold: 5 * 1024 * 1024 * 1024,  // 5GB in bytes
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })
    dbStorageAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic))

    // ── ALB Metrics ─────────────────────────────────────────────────

    // 5xx error rate alarm
    const errorAlarm = new cloudwatch.Alarm(this, '5xxAlarm', {
      alarmName: `lotus-pm-${env}-5xx-errors`,
      alarmDescription: 'ALB 5xx errors > 10 in 5 minutes',
      metric: props.fargateService.loadBalancer.metrics.httpCodeElb(
        cdk.aws_elasticloadbalancingv2.HttpCodeElb.ELB_5XX_COUNT,
        { period: cdk.Duration.minutes(5), statistic: 'Sum' }
      ),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })
    errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic))

    // ── CloudWatch Dashboard ─────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `lotus-pm-${env}`,
    })

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS CPU & Memory',
        left: [cpuMetric],
        right: [memoryMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS CPU & Free Storage',
        left: [props.db.metricCPUUtilization()],
        right: [props.db.metricFreeStorageSpace()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Request Count & Latency',
        left: [
          props.fargateService.loadBalancer.metrics.requestCount({ period: cdk.Duration.minutes(5) }),
        ],
        right: [
          props.fargateService.loadBalancer.metrics.targetResponseTime({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Running Tasks',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'ECS/ContainerInsights',
            metricName: 'RunningTaskCount',
            dimensionsMap: {
              ClusterName: props.fargateService.cluster.clusterName,
              ServiceName: props.fargateService.service.serviceName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
      }),
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        alarms: [cpuAlarm, memoryAlarm, dbCpuAlarm, dbStorageAlarm, errorAlarm],
        width: 18,
      })
    )

    cdk.Tags.of(this).add('Project', 'lotus-pm')
    cdk.Tags.of(this).add('Environment', env)
    cdk.Tags.of(this).add('ManagedBy', 'cdk')
  }
}
