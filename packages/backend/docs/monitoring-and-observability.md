# Monitoring and Observability for AgentCore Implementation

This document describes the monitoring and observability features implemented for the CICADA AgentCore agents.

## Overview

The monitoring and observability implementation provides comprehensive visibility into agent performance, errors, and coordination patterns. It includes:

1. **CloudWatch Metrics** - Custom metrics for agent invocations, latency, token usage, and errors
2. **Agent Dashboard** - Dedicated CloudWatch dashboard for agent-specific metrics
3. **Structured Logging** - Enhanced logging with agent-specific metadata
4. **X-Ray Tracing** - Distributed tracing for agent coordination
5. **CloudWatch Alarms** - Automated alerts for errors and high latency

## Requirements Addressed

- **13.1**: Add CloudWatch metrics for agent invocations
- **13.2**: Create agent-specific dashboard
- **13.3**: Implement structured logging for agent calls
- **13.4**: Add X-Ray tracing for agent coordination
- **13.5**: Set up alarms for agent errors

## CloudWatch Metrics

### Custom Metrics Namespace

All agent metrics are published to the `CICADA/Agents` namespace using CloudWatch Embedded Metric Format (EMF).

### Available Metrics

#### Agent Invocation Metrics

- **AgentInvocationCount** - Total number of agent invocations
  - Dimensions: `AgentName` (Orchestrator, Query, Theory, Profile)
  - Unit: Count
  - Statistic: Sum

- **AgentInvocationDuration** - Time taken for agent invocations
  - Dimensions: `AgentName`
  - Unit: Milliseconds
  - Statistic: Average, p50, p90, p99

- **AgentInvocationErrors** - Number of failed agent invocations
  - Dimensions: `AgentName`, `ErrorType`
  - Unit: Count
  - Statistic: Sum

#### Token Usage Metrics

- **AgentTokenUsage** - Total tokens consumed by agent
  - Dimensions: `AgentName`
  - Unit: Count
  - Statistic: Sum

- **AgentInputTokens** - Input tokens consumed
  - Dimensions: `AgentName`
  - Unit: Count
  - Statistic: Sum

- **AgentOutputTokens** - Output tokens generated
  - Dimensions: `AgentName`
  - Unit: Count
  - Statistic: Sum

#### Coordination Metrics

- **AgentCoordinationLatency** - Time for agent-to-agent invocations
  - Dimensions: `CoordinationType` (e.g., "Orchestrator-Query", "Theory-Query")
  - Unit: Milliseconds
  - Statistic: Average, p50, p90, p99

### Metric Emission

Metrics are automatically emitted using CloudWatch Embedded Metric Format (EMF) through structured logging. The logger utility includes a private `emitMetric()` method that formats logs in EMF format, allowing CloudWatch to automatically extract metrics from log entries.

Example EMF log entry:
```json
{
  "_aws": {
    "Timestamp": 1234567890,
    "CloudWatchMetrics": [{
      "Namespace": "CICADA/Agents",
      "Dimensions": [["AgentName"]],
      "Metrics": [{
        "Name": "AgentInvocationCount",
        "Unit": "Count"
      }]
    }]
  },
  "AgentName": "Orchestrator",
  "AgentInvocationCount": 1
}
```

## Agent Dashboard

### Dashboard Name

`CICADA-Agents`

### Dashboard Widgets

The agent dashboard includes the following widgets:

1. **Agent Invocations (5min)** - Line graph showing invocation count for all agents
2. **Agent Invocation Latency (ms)** - Line graph showing average latency per agent
3. **Agent Invocation Errors (5min)** - Line graph showing error count per agent
4. **Token Usage by Agent (1hr)** - Line graph showing token consumption per agent
5. **Agent Coordination Latency (ms)** - Line graph showing coordination latency between agents
6. **Agent Tools Lambda Invocations** - Line graph showing Lambda invocation count
7. **Agent Tools Lambda Errors** - Line graph showing Lambda error count
8. **Agent Tools Lambda Duration (ms)** - Line graph showing Lambda execution time
9. **Total Agent Invocations (24h)** - Single value widget showing 24-hour total
10. **Total Agent Errors (24h)** - Single value widget showing 24-hour error total
11. **Total Tokens Used (24h)** - Single value widget showing 24-hour token usage
12. **Avg Agent Latency (24h)** - Single value widget showing 24-hour average latency

### Accessing the Dashboard

The dashboard URL is available as a CloudWatch output from the monitoring stack:

```bash
# Get dashboard URL from CDK outputs
cdk deploy CICADAMonitoringStack --outputs-file outputs.json
cat outputs.json | jq -r '.CICADAMonitoringStack.AgentDashboardURL'
```

Or navigate directly in the AWS Console:
```
CloudWatch → Dashboards → CICADA-Agents
```

## Structured Logging

### Logger Enhancements

The `Logger` class has been enhanced with agent-specific logging methods:

#### Agent Invocation Logging

```typescript
// Log agent invocation start
logger.logAgentInvocationStart({
  agentName: 'Orchestrator',
  agentId: 'agent-123',
  agentAliasId: 'alias-456',
  sessionId: 'session-789',
  userId: 'user-abc',
  requestId: 'req-xyz',
  attempt: 1,
  maxRetries: 3,
  traceId: 'trace-id',
});

// Log successful invocation
logger.logAgentInvocationSuccess({
  agentName: 'Orchestrator',
  agentId: 'agent-123',
  duration: 1234,
  tokenUsage: {
    input: 100,
    output: 50,
    total: 150,
  },
  traceId: 'trace-id',
});

// Log failed invocation
logger.logAgentInvocationFailure({
  agentName: 'Orchestrator',
  agentId: 'agent-123',
  errorName: 'ThrottlingException',
  errorCode: 'THROTTLED',
  retryable: true,
  traceId: 'trace-id',
}, error);
```

#### Agent Coordination Logging

```typescript
// Log agent coordination
logger.logAgentCoordination({
  sourceAgent: 'Orchestrator',
  targetAgent: 'Query',
  coordinationType: 'Orchestrator-Query',
  duration: 2345,
  requestId: 'req-xyz',
  traceId: 'trace-id',
});
```

#### Streaming Event Logging

```typescript
// Log streaming events
logger.logStreamingEvent('stream_start', { agentName: 'Query' });
logger.logStreamingEvent('stream_chunk', { agentName: 'Query', chunkNumber: 1 });
logger.logStreamingEvent('stream_complete', { agentName: 'Query', chunkCount: 10 });
logger.logStreamingEvent('stream_error', { agentName: 'Query', error: 'Connection lost' });
```

### Log Structure

All logs include:
- `level` - Log level (info, warn, error, debug)
- `context` - Logger context (e.g., "cicada")
- `message` - Human-readable message
- `timestamp` - ISO 8601 timestamp
- `eventType` - Event type for filtering (e.g., "agent_invocation_start")
- Additional metadata specific to the event

### Querying Logs

Use CloudWatch Logs Insights to query structured logs:

```sql
-- Find all agent invocations
fields @timestamp, agentName, duration, tokenUsage.total
| filter eventType = "agent_invocation_success"
| sort @timestamp desc

-- Find agent errors
fields @timestamp, agentName, errorName, errorCode, retryable
| filter eventType = "agent_invocation_failure"
| sort @timestamp desc

-- Find agent coordination patterns
fields @timestamp, sourceAgent, targetAgent, duration
| filter eventType = "agent_coordination"
| stats avg(duration) by coordinationType

-- Find high-latency invocations
fields @timestamp, agentName, duration
| filter eventType = "agent_invocation_success" and duration > 10000
| sort duration desc
```

## X-Ray Tracing

### Tracing Configuration

X-Ray tracing is enabled for all agent tool Lambda functions:

- `OrchestratorAgentToolsFunction` - Active tracing
- `QueryAgentToolsFunction` - Active tracing
- `TheoryAgentToolsFunction` - Active tracing
- `ProfileAgentToolsFunction` - Active tracing

### Trace IDs

Trace IDs are automatically propagated through:
1. Lambda environment variable `_X_AMZN_TRACE_ID`
2. Structured logs include `traceId` field
3. Agent coordination events link source and target agents

### Viewing Traces

Access X-Ray traces in the AWS Console:
```
X-Ray → Traces → Filter by service name
```

Or use the X-Ray service map to visualize agent coordination:
```
X-Ray → Service map
```

### Trace Segments

Each agent invocation creates trace segments showing:
- Lambda function execution time
- Bedrock agent invocation time
- DynamoDB operations (for profile/theory agents)
- Agent-to-agent coordination

## CloudWatch Alarms

### Alarm Configuration

Alarms are created for each agent when an alert email is provided:

#### Error Rate Alarms

- **Name**: `CICADA-{AgentName}-Agent-Errors`
- **Metric**: `AgentInvocationErrors`
- **Threshold**: 5 errors in 5 minutes
- **Action**: Send SNS notification

#### Lambda Error Alarms

- **Name**: `CICADA-{AgentName}-Lambda-Errors`
- **Metric**: Lambda `Errors`
- **Threshold**: 3 errors in 5 minutes
- **Action**: Send SNS notification

#### High Latency Alarms

- **Name**: `CICADA-{AgentName}-Agent-HighLatency`
- **Metric**: `AgentInvocationDuration`
- **Threshold**: Average > 30 seconds for 2 consecutive periods
- **Action**: Send SNS notification

### Alarm Actions

All alarms publish to the `CICADA-Alarms` SNS topic, which sends email notifications to the configured alert email address.

### Configuring Alarms

Set the alert email when deploying the monitoring stack:

```typescript
new MonitoringStack(this, 'MonitoringStack', {
  dataStack,
  apiStack,
  agentStack,
  alertEmail: 'alerts@example.com',
});
```

## Cost Monitoring

### Budget Alarms

The monitoring stack includes budget alarms:

- **Monthly Budget**: $100/month (80% threshold alert)
- **Daily Budget**: $3.33/day (100% threshold alert)

### Token Usage Tracking

Monitor token usage to optimize costs:

```sql
-- Total tokens by agent (last 24 hours)
fields @timestamp, agentName, tokenUsage.total
| filter eventType = "agent_invocation_success"
| stats sum(tokenUsage.total) as totalTokens by agentName

-- Average tokens per invocation
fields @timestamp, agentName, tokenUsage.total
| filter eventType = "agent_invocation_success"
| stats avg(tokenUsage.total) as avgTokens by agentName
```

## Best Practices

### 1. Monitor Key Metrics Daily

Check the agent dashboard daily for:
- Error rate trends
- Latency patterns
- Token usage growth
- Coordination bottlenecks

### 2. Set Up Alerts

Configure email alerts for:
- High error rates (> 5 errors/5min)
- High latency (> 30 seconds average)
- Budget thresholds (80% monthly, 100% daily)

### 3. Use Structured Logs for Debugging

When investigating issues:
1. Find the `requestId` from user reports
2. Query CloudWatch Logs Insights for all events with that `requestId`
3. Follow the `traceId` through agent coordination
4. Check X-Ray traces for detailed timing

### 4. Optimize Based on Metrics

Use metrics to identify optimization opportunities:
- High token usage → Review agent instructions for verbosity
- High latency → Check for unnecessary agent-to-agent calls
- High error rates → Review retry logic and error handling

### 5. Regular Cost Reviews

Review token usage and costs weekly:
- Compare actual vs. budgeted costs
- Identify agents with highest token consumption
- Optimize agent instructions to reduce tokens
- Consider using Nova Micro for simpler operations

## Troubleshooting

### Metrics Not Appearing

If metrics don't appear in CloudWatch:

1. Check that EMF logs are being written:
   ```bash
   aws logs tail /aws/lambda/CICADA-OrchestratorAgentToolsFunction --follow
   ```

2. Verify EMF format is correct (should include `_aws` field)

3. Wait 1-2 minutes for metrics to propagate

### Alarms Not Triggering

If alarms don't trigger:

1. Verify SNS topic subscription is confirmed (check email)
2. Check alarm state in CloudWatch console
3. Verify metric data is being published
4. Check alarm threshold and evaluation period settings

### X-Ray Traces Missing

If X-Ray traces are missing:

1. Verify Lambda functions have `tracing: lambda.Tracing.ACTIVE`
2. Check Lambda execution role has X-Ray permissions
3. Verify `_X_AMZN_TRACE_ID` environment variable is set
4. Check X-Ray daemon is running (automatic for Lambda)

## Related Documentation

- [AWS CloudWatch Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html)
- [AWS X-Ray Developer Guide](https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html)
- [CloudWatch Logs Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- [AgentCore Implementation Design](../../../.kiro/specs/agentcore-implementation/design.md)
