import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { ComputeStack } from './compute-stack';
import { APIStack } from './api-stack';

export interface MonitoringStackProps extends cdk.StackProps {
  dataStack: DataStack;
  computeStack: ComputeStack;
  apiStack: APIStack;
  alertEmail?: string;
}

export class MonitoringStack extends cdk.Stack {
  public readonly costAlarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for cost alerts
    this.costAlarmTopic = new sns.Topic(this, 'CostAlarmTopic', {
      displayName: 'CICADA Cost Alerts',
      topicName: 'CICADA-Cost-Alerts',
    });

    // Subscribe email to cost alerts if provided
    if (props.alertEmail) {
      this.costAlarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create CloudWatch alarm for daily cost > $3
    // Note: AWS Budgets is better for cost monitoring, but CloudWatch can track usage metrics
    const dailyCostAlarm = new cloudwatch.Alarm(this, 'DailyCostAlarm', {
      alarmName: 'CICADA-Daily-Cost-Exceeded',
      alarmDescription: 'Alert when estimated daily cost exceeds $3',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: {
          Currency: 'USD',
        },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6),
      }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dailyCostAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.costAlarmTopic));

    // Create CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'CICADADashboard', {
      dashboardName: 'CICADA-Monitoring',
    });

    // Add cost widget
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Estimated Charges',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: {
              Currency: 'USD',
            },
            statistic: 'Maximum',
            period: cdk.Duration.hours(6),
          }),
        ],
        width: 12,
      })
    );

    // Add API Gateway metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'WebSocket API Metrics',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: {
              ApiId: props.apiStack.webSocketApi.apiId,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Request Count',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'IntegrationLatency',
            dimensionsMap: {
              ApiId: props.apiStack.webSocketApi.apiId,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Latency (ms)',
          }),
        ],
        width: 12,
      })
    );

    // Add DynamoDB metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Usage',
        left: [
          props.dataStack.userProfilesTable.metricConsumedReadCapacityUnits({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Profiles Read',
          }),
          props.dataStack.userProfilesTable.metricConsumedWriteCapacityUnits({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Profiles Write',
          }),
        ],
        width: 12,
      })
    );

    // Add SQS metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Message Queue Metrics',
        left: [
          props.apiStack.messageQueue.metricNumberOfMessagesSent({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Messages Sent',
          }),
          props.apiStack.messageQueue.metricNumberOfMessagesReceived({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Messages Received',
          }),
        ],
        right: [
          props.apiStack.messageQueue.metricApproximateAgeOfOldestMessage({
            statistic: 'Maximum',
            period: cdk.Duration.minutes(5),
            label: 'Oldest Message Age (s)',
          }),
        ],
        width: 12,
      })
    );

    // Add usage tracking metrics widget
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Current Month Estimated Cost',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: {
              Currency: 'USD',
            },
            statistic: 'Maximum',
            period: cdk.Duration.hours(6),
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total API Requests (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: {
              ApiId: props.apiStack.webSocketApi.apiId,
            },
            statistic: 'Sum',
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 6,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'DashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    new cdk.CfnOutput(this, 'CostAlarmTopicArn', {
      value: this.costAlarmTopic.topicArn,
      description: 'SNS Topic ARN for cost alerts',
      exportName: 'CICAdaCostAlarmTopicArn',
    });
  }
}
