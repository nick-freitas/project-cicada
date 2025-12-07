import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { APIStack } from './api-stack';

export interface MonitoringStackProps extends cdk.StackProps {
  dataStack: DataStack;
  apiStack: APIStack;
  alertEmail?: string;
  monthlyBudgetLimit?: number; // Default: $100
  dailyBudgetLimit?: number; // Default: $3.33 (~$100/30)
}

export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly monthlyBudget: budgets.CfnBudget;
  public readonly dailyBudget: budgets.CfnBudget;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const monthlyLimit = props.monthlyBudgetLimit || 100;
    const dailyLimit = props.dailyBudgetLimit || 3.33;

    // Build monthly budget notifications - alert at 80% threshold
    const monthlyNotifications: budgets.CfnBudget.NotificationWithSubscribersProperty[] = [];

    // Monthly budget: 80% threshold notification (requires email)
    if (props.alertEmail) {
      monthlyNotifications.push({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold: 80,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [
          {
            subscriptionType: 'EMAIL',
            address: props.alertEmail,
          },
        ],
      });
    }

    // Create AWS Budget for monthly cost tracking
    this.monthlyBudget = new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'CICADA-Monthly-Budget',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: monthlyLimit,
          unit: 'USD',
        },
        costFilters: {
          // Optional: Filter by tags if you want to track only CICADA resources
          // TagKeyValue: ['user:Project$CICADA'],
        },
        costTypes: {
          includeCredit: false,
          includeDiscount: true,
          includeOtherSubscription: true,
          includeRecurring: true,
          includeRefund: false,
          includeSubscription: true,
          includeSupport: false,
          includeTax: false,
          includeUpfront: true,
          useBlended: false,
        },
      },
      notificationsWithSubscribers: monthlyNotifications,
    });

    // Build daily budget notifications - alert at 100% threshold
    const dailyNotifications: budgets.CfnBudget.NotificationWithSubscribersProperty[] = [];

    // Daily budget: 100% threshold notification (requires email)
    if (props.alertEmail) {
      dailyNotifications.push({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold: 100,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [
          {
            subscriptionType: 'EMAIL',
            address: props.alertEmail,
          },
        ],
      });
    }

    // Create AWS Budget for daily cost tracking
    this.dailyBudget = new budgets.CfnBudget(this, 'DailyBudget', {
      budget: {
        budgetName: 'CICADA-Daily-Budget',
        budgetType: 'COST',
        timeUnit: 'DAILY',
        budgetLimit: {
          amount: dailyLimit,
          unit: 'USD',
        },
        costFilters: {
          // Optional: Filter by tags if you want to track only CICADA resources
          // TagKeyValue: ['user:Project$CICADA'],
        },
        costTypes: {
          includeCredit: false,
          includeDiscount: true,
          includeOtherSubscription: true,
          includeRecurring: true,
          includeRefund: false,
          includeSubscription: true,
          includeSupport: false,
          includeTax: false,
          includeUpfront: true,
          useBlended: false,
        },
      },
      notificationsWithSubscribers: dailyNotifications,
    });

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

    new cdk.CfnOutput(this, 'BudgetURL', {
      value: `https://console.aws.amazon.com/billing/home#/budgets`,
      description: 'AWS Budgets Console URL',
    });

    new cdk.CfnOutput(this, 'MonthlyBudgetLimit', {
      value: monthlyLimit.toString(),
      description: 'Monthly budget limit in USD',
    });

    new cdk.CfnOutput(this, 'DailyBudgetLimit', {
      value: dailyLimit.toString(),
      description: 'Daily budget limit in USD',
    });
  }
}
