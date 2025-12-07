# AWS Budgets Cost Monitoring Guide

The MonitoringStack now uses AWS Budgets for comprehensive cost tracking and alerts.

## What's Configured

### Monthly Budget
- **Default Limit:** $100/month
- **Budget Type:** COST (tracks actual spending)
- **Time Period:** Monthly (resets each month)

### Automatic Alerts

1. **80% Threshold (Warning)**
   - Triggers when you've spent $80 of your $100 budget
   - Email notification sent
   - Helps you take action before hitting the limit

2. **100% Threshold (Critical)**
   - Triggers when you've spent $100 (full budget)
   - Email + SNS notification sent
   - Indicates budget exceeded

3. **Forecasted Overage**
   - AWS predicts if you'll exceed budget by month-end
   - Based on current spending trends
   - Email notification sent
   - Allows proactive cost management

## Customizing Budget Limits

### Option 1: Update MonitoringStack Props

Edit `infrastructure/bin/app.ts`:

```typescript
const monitoringStack = new MonitoringStack(app, 'ProjectCICADAMonitoringStack', {
  dataStack,
  computeStack,
  apiStack,
  alertEmail: 'your-email@example.com', // Optional: Get email alerts
  monthlyBudgetLimit: 50, // Set to $50/month instead of $100
  env,
});
```

### Option 2: Environment Variables

Add to `.env.nonprod` or `.env.prod`:

```bash
MONTHLY_BUDGET_LIMIT=50
ALERT_EMAIL=your-email@example.com
```

Then update the app.ts to read from env:

```typescript
monthlyBudgetLimit: Number(process.env.MONTHLY_BUDGET_LIMIT) || 100,
alertEmail: process.env.ALERT_EMAIL,
```

## Setting Up Email Alerts

### During Deployment

Set the `alertEmail` prop when creating the MonitoringStack:

```typescript
alertEmail: 'your-email@example.com'
```

### After Deployment

1. Go to AWS Console → Budgets
2. Click on "CICADA-Monthly-Budget"
3. Click "Edit"
4. Scroll to "Alert contacts"
5. Add your email address
6. Save changes
7. Confirm the subscription email AWS sends you

## Viewing Budget Status

### AWS Console
1. Go to https://console.aws.amazon.com/billing/home#/budgets
2. Click on "CICADA-Monthly-Budget"
3. View:
   - Current spend vs budget
   - Forecasted spend
   - Historical trends
   - Alert history

### CloudWatch Dashboard
The CloudWatch dashboard still shows real-time metrics:
- Estimated charges
- API request counts
- DynamoDB usage
- SQS queue metrics

## Budget vs CloudWatch Alarms

| Feature | AWS Budgets | CloudWatch Alarms |
|---------|-------------|-------------------|
| **Cost Tracking** | ✅ Accurate, updated daily | ⚠️ Estimated, delayed |
| **Forecasting** | ✅ Yes | ❌ No |
| **Monthly Limits** | ✅ Yes | ❌ No (only point-in-time) |
| **Multiple Thresholds** | ✅ Yes (80%, 100%, forecast) | ⚠️ One threshold per alarm |
| **Email Alerts** | ✅ Built-in | ✅ Via SNS |
| **Cost** | ✅ Free (first 2 budgets) | ✅ Free (first 10 alarms) |

**Recommendation:** Use AWS Budgets for cost monitoring (more accurate and feature-rich)

## Cost Breakdown by Service

To see which services are costing the most:

1. Go to AWS Console → Cost Explorer
2. Click "Launch Cost Explorer"
3. Select time range (e.g., "Last 30 days")
4. Group by: "Service"
5. View breakdown:
   - DynamoDB
   - Lambda
   - API Gateway
   - S3
   - CloudWatch
   - etc.

## Setting Up Cost Allocation Tags

To track CICADA costs separately from other projects:

### 1. Add Tags to Resources

Update your CDK stacks to add tags:

```typescript
cdk.Tags.of(this).add('Project', 'CICADA');
cdk.Tags.of(this).add('Environment', 'nonprod');
```

### 2. Activate Cost Allocation Tags

1. Go to AWS Console → Billing → Cost Allocation Tags
2. Find "Project" and "Environment" tags
3. Click "Activate"
4. Wait 24 hours for data to appear

### 3. Filter Budget by Tags

Update the MonitoringStack budget:

```typescript
costFilters: {
  TagKeyValue: ['user:Project$CICADA'],
},
```

## Budget Actions (Advanced)

AWS Budgets can automatically take actions when thresholds are exceeded:

### Example: Stop EC2 Instances

```typescript
{
  notification: {
    notificationType: 'ACTUAL',
    comparisonOperator: 'GREATER_THAN',
    threshold: 100,
    thresholdType: 'PERCENTAGE',
  },
  subscribers: [
    {
      subscriptionType: 'SNS',
      address: this.costAlarmTopic.topicArn,
    },
  ],
}
```

**Note:** CICADA uses serverless (Lambda, DynamoDB), so there are no instances to stop. Budget actions are more useful for EC2-based workloads.

## Monitoring Best Practices

### 1. Set Realistic Budgets
- Start with $100/month
- Adjust based on actual usage after 1-2 months
- Set alerts at 80% to have time to react

### 2. Review Weekly
- Check budget status every week
- Identify cost spikes early
- Adjust usage if needed

### 3. Use Cost Explorer
- Analyze which services cost the most
- Look for unexpected charges
- Optimize high-cost services

### 4. Enable Detailed Billing
- Go to Billing → Billing Preferences
- Enable "Receive Billing Alerts"
- Enable "Receive PDF Invoice By Email"

### 5. Set Up Multiple Budgets
- Monthly budget: $100
- Quarterly budget: $300
- Annual budget: $1200

## Troubleshooting

### Not Receiving Email Alerts?

1. **Check spam folder** - AWS emails sometimes go to spam
2. **Confirm subscription** - Click the confirmation link in the email AWS sent
3. **Verify email address** - Check it's correct in the budget settings
4. **Check SNS subscription** - Go to SNS → Topics → CICADA-Cost-Alerts → Subscriptions

### Budget Not Updating?

- AWS Budgets update once per day (not real-time)
- Wait 24 hours after deployment for first data
- Check Cost Explorer for more recent data

### Forecast Not Showing?

- Forecasts require at least 5 days of historical data
- New accounts may not have forecasts initially
- Wait a week after deployment for forecasts to appear

## Redeploying with Budget Changes

```bash
# Update budget limit in code or env file
# Then redeploy just the monitoring stack
cd infrastructure
pnpm run cdk deploy ProjectCICADAMonitoringStack
```

## Deleting the Budget

If you destroy the MonitoringStack, the budget is automatically deleted:

```bash
cd infrastructure
pnpm run cdk destroy ProjectCICADAMonitoringStack
```

## Additional Resources

- [AWS Budgets Documentation](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
- [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/)
- [AWS Cost Optimization](https://aws.amazon.com/pricing/cost-optimization/)
