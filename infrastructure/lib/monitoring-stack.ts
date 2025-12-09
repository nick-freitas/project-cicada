import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { APIStack } from './api-stack';
import { AgentStack } from './agent-stack';

export interface MonitoringStackProps extends cdk.StackProps {
  dataStack: DataStack;
  apiStack: APIStack;
  agentStack?: AgentStack;
  alertEmail?: string;
  monthlyBudgetLimit?: number; // Default: $100
  dailyBudgetLimit?: number; // Default: $3.33 (~$100/30)
}

export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public agentDashboard?: cloudwatch.Dashboard;
  public readonly monthlyBudget: budgets.CfnBudget;
  public readonly dailyBudget: budgets.CfnBudget;
  public alarmTopic?: sns.Topic;

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

    // Create SNS topic for alarms if email is provided
    // Requirement 13.5: Set up alarms for agent errors
    if (props.alertEmail) {
      this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
        displayName: 'CICADA Monitoring Alarms',
        topicName: 'CICADA-Alarms',
      });

      this.alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create agent-specific monitoring if agent stack is provided
    // Requirement 13.1, 13.2, 13.3, 13.4: Agent monitoring and observability
    if (props.agentStack) {
      this.createAgentMonitoring(props.agentStack);
    }
  }

  /**
   * Create agent-specific monitoring dashboard and alarms
   * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
   */
  private createAgentMonitoring(agentStack: AgentStack): void {
    // Create agent-specific dashboard
    // Requirement 13.2: Create agent-specific dashboard
    this.agentDashboard = new cloudwatch.Dashboard(this, 'AgentDashboard', {
      dashboardName: 'CICADA-Agents',
    });

    // Create custom metrics namespace
    const namespace = 'CICADA/Agents';

    // TODO: Task 14 - Update agent monitoring for AgentCore Lambda functions
    // Define agent names for metrics (currently empty until AgentCore functions are added)
    const agents: Array<{ name: string; function?: lambdaNodejs.NodejsFunction }> = [
      // { name: 'Gateway', function: agentStack.gatewayFunction },
      // { name: 'Orchestrator', function: agentStack.orchestratorFunction },
      // { name: 'Query', function: agentStack.queryFunction },
      // { name: 'Theory', function: agentStack.theoryFunction },
      // { name: 'Profile', function: agentStack.profileFunction },
    ];

    // Agent Invocation Count Widget
    // Requirement 13.1: Add CloudWatch metrics for agent invocations
    const invocationMetrics = agents.map(agent =>
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentInvocationCount',
        dimensionsMap: {
          AgentName: agent.name,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
        label: `${agent.name} Invocations`,
      })
    );

    this.agentDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Invocations (5min)',
        left: invocationMetrics,
        width: 12,
        height: 6,
      })
    );

    // Agent Invocation Duration Widget
    // Requirement 13.2: Emit metrics for latency
    const durationMetrics = agents.map(agent =>
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentInvocationDuration',
        dimensionsMap: {
          AgentName: agent.name,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        label: `${agent.name} Avg Duration`,
        unit: cloudwatch.Unit.MILLISECONDS,
      })
    );

    this.agentDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Invocation Latency (ms)',
        left: durationMetrics,
        width: 12,
        height: 6,
      })
    );

    // Agent Error Rate Widget
    // Requirement 13.3: Log detailed error information
    const errorMetrics = agents.map(agent =>
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentInvocationErrors',
        dimensionsMap: {
          AgentName: agent.name,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
        label: `${agent.name} Errors`,
      })
    );

    this.agentDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Invocation Errors (5min)',
        left: errorMetrics,
        width: 12,
        height: 6,
      })
    );

    // Token Usage Widget
    // Requirement 13.2: Emit metrics for token usage
    const tokenMetrics = agents.map(agent =>
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentTokenUsage',
        dimensionsMap: {
          AgentName: agent.name,
        },
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
        label: `${agent.name} Tokens`,
      })
    );

    this.agentDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Token Usage by Agent (1hr)',
        left: tokenMetrics,
        width: 12,
        height: 6,
      })
    );

    // Agent Coordination Latency Widget
    // Requirement 13.4: Trace the flow of requests across agents
    const coordinationMetrics = [
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentCoordinationLatency',
        dimensionsMap: {
          CoordinationType: 'Orchestrator-Query',
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        label: 'Orchestrator → Query',
        unit: cloudwatch.Unit.MILLISECONDS,
      }),
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentCoordinationLatency',
        dimensionsMap: {
          CoordinationType: 'Orchestrator-Theory',
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        label: 'Orchestrator → Theory',
        unit: cloudwatch.Unit.MILLISECONDS,
      }),
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentCoordinationLatency',
        dimensionsMap: {
          CoordinationType: 'Orchestrator-Profile',
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        label: 'Orchestrator → Profile',
        unit: cloudwatch.Unit.MILLISECONDS,
      }),
      new cloudwatch.Metric({
        namespace,
        metricName: 'AgentCoordinationLatency',
        dimensionsMap: {
          CoordinationType: 'Theory-Query',
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        label: 'Theory → Query',
        unit: cloudwatch.Unit.MILLISECONDS,
      }),
    ];

    this.agentDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Coordination Latency (ms)',
        left: coordinationMetrics,
        width: 12,
        height: 6,
      })
    );

    // Lambda Function Metrics for Agent Tools
    // Filter out agents without functions (during migration)
    const agentsWithFunctions = agents.filter(agent => agent.function !== undefined);
    
    if (agentsWithFunctions.length > 0) {
      const lambdaInvocations = agentsWithFunctions.map(agent =>
        agent.function!.metricInvocations({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: `${agent.name} Lambda Invocations`,
        })
      );

      this.agentDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Agent Tools Lambda Invocations',
          left: lambdaInvocations,
          width: 12,
          height: 6,
        })
      );

      const lambdaErrors = agentsWithFunctions.map(agent =>
        agent.function!.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: `${agent.name} Lambda Errors`,
        })
      );

      this.agentDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Agent Tools Lambda Errors',
          left: lambdaErrors,
          width: 12,
          height: 6,
        })
      );

      const lambdaDuration = agentsWithFunctions.map(agent =>
        agent.function!.metricDuration({
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: `${agent.name} Lambda Duration`,
        })
      );

      this.agentDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Agent Tools Lambda Duration (ms)',
          left: lambdaDuration,
          width: 12,
          height: 6,
        })
      );
    }

    // Single Value Widgets for Key Metrics
    this.agentDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Total Agent Invocations (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'AgentInvocationCount',
            statistic: 'Sum',
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 6,
        height: 3,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Agent Errors (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'AgentInvocationErrors',
            statistic: 'Sum',
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 6,
        height: 3,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Tokens Used (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'AgentTokenUsage',
            statistic: 'Sum',
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 6,
        height: 3,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Avg Agent Latency (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'AgentInvocationDuration',
            statistic: 'Average',
            period: cdk.Duration.hours(24),
            unit: cloudwatch.Unit.MILLISECONDS,
          }),
        ],
        width: 6,
        height: 3,
      })
    );

    // Create alarms for agent errors
    // Requirement 13.5: Set up alarms for agent errors
    if (this.alarmTopic) {
      agentsWithFunctions.forEach(agent => {
        // Alarm for high error rate
        const errorAlarm = new cloudwatch.Alarm(this, `${agent.name}AgentErrorAlarm`, {
          alarmName: `CICADA-${agent.name}-Agent-Errors`,
          alarmDescription: `Alert when ${agent.name} Agent has high error rate`,
          metric: new cloudwatch.Metric({
            namespace,
            metricName: 'AgentInvocationErrors',
            dimensionsMap: {
              AgentName: agent.name,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: 5, // Alert if more than 5 errors in 5 minutes
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        if (this.alarmTopic) {
          errorAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
        }

        // Alarm for Lambda function errors
        const lambdaErrorAlarm = agent.function!.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }).createAlarm(this, `${agent.name}LambdaErrorAlarm`, {
          alarmName: `CICADA-${agent.name}-Lambda-Errors`,
          alarmDescription: `Alert when ${agent.name} Agent Lambda has errors`,
          threshold: 3,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        if (this.alarmTopic) {
          lambdaErrorAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
        }

        // Alarm for high latency
        const latencyAlarm = new cloudwatch.Alarm(this, `${agent.name}AgentLatencyAlarm`, {
          alarmName: `CICADA-${agent.name}-Agent-HighLatency`,
          alarmDescription: `Alert when ${agent.name} Agent has high latency`,
          metric: new cloudwatch.Metric({
            namespace,
            metricName: 'AgentInvocationDuration',
            dimensionsMap: {
              AgentName: agent.name,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            unit: cloudwatch.Unit.MILLISECONDS,
          }),
          threshold: 30000, // Alert if average latency > 30 seconds
          evaluationPeriods: 2, // Must be high for 2 consecutive periods
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        if (this.alarmTopic) {
          latencyAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
        }
      });
    }

    // Output agent dashboard URL
    new cdk.CfnOutput(this, 'AgentDashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.agentDashboard.dashboardName}`,
      description: 'Agent-specific CloudWatch Dashboard URL',
    });
  }
}
