# Non-Production Deployment Outputs

**Deployment Date:** December 7, 2025  
**AWS Account:** 461449807480  
**Region:** us-east-1

## ✅ Deployment Status: SUCCESS

All 7 stacks deployed successfully:
- ✅ ProjectCICADADataStack
- ✅ ProjectCICADAAuthStack  
- ✅ ProjectCICADAComputeStack
- ✅ ProjectCICADAAgentStack
- ✅ ProjectCICADAAPIStack
- ✅ ProjectCICADAFrontendStack
- ✅ ProjectCICADAMonitoringStack

## Key Outputs (from deployment log)

### DataStack
```
KnowledgeBaseBucketName = projectcicadadatastack-knowledgebaseb1c941bd-c9dlb1vfufrx
ScriptDataBucketName = projectcicadadatastack-scriptdataf7e49bc5-sbazmw7cux4c
```

### DynamoDB Tables (auto-generated names)
```
ConversationMemory = ProjectCICADADataStack-ConversationMemoryA79C77FF-15I83CGMUYT6Z
EpisodeConfiguration = ProjectCICADADataStack-EpisodeConfiguration720ADACC-1RRDUZW2K5C2C
FragmentGroups = ProjectCICADADataStack-FragmentGroups936AA7CE-MFRLTXSD3SSV
RequestTracking = ProjectCICADADataStack-RequestTrackingCDC37650-144B27TJ3T28H
UserProfiles = ProjectCICADADataStack-UserProfiles32DFB678-A44VK6F5GRX
```

### MonitoringStack
```
CostAlarmTopicArn = arn:aws:sns:us-east-1:461449807480:CICADA-Cost-Alerts
DashboardURL = https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=CICADA-Monitoring
```

## Next Steps

### 1. Get Auth Stack Outputs (Cognito)

Go to AWS Console → CloudFormation → ProjectCICADAAuthStack → Outputs tab

You need:
- `UserPoolId` - Cognito User Pool ID
- `UserPoolClientId` - Cognito Client ID

### 2. Get API Stack Outputs

Go to AWS Console → CloudFormation → ProjectCICADAAPIStack → Outputs tab

You need:
- `WebSocketURL` - WebSocket API endpoint
- `RestAPIURL` - REST API endpoint  
- `StateMachineArn` - Step Functions ARN

### 3. Set User Passwords

The deployment created 3 users but didn't set passwords. Set them now:

```bash
# Get the User Pool ID from CloudFormation outputs first
USER_POOL_ID="<from CloudFormation outputs>"

# Set passwords for each user
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --password "YourSecurePassword123!" \
  --permanent

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username nick \
  --password "YourSecurePassword123!" \
  --permanent

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username naizak \
  --password "YourSecurePassword123!" \
  --permanent
```

### 4. Update Frontend Environment

Edit `packages/frontend/.env.nonprod`:

```bash
VITE_WEBSOCKET_URL=<WebSocketURL from CloudFormation>
VITE_API_URL=<RestAPIURL from CloudFormation>
```

### 5. Test the Deployment

```bash
# Build frontend with nonprod config
pnpm --filter @cicada/frontend run build:nonprod

# Or run dev server
pnpm --filter @cicada/frontend run dev:nonprod
```

## Accessing CloudFormation Outputs

### Via AWS Console
1. Go to https://console.aws.amazon.com/cloudformation
2. Select the stack (e.g., ProjectCICADAAuthStack)
3. Click the "Outputs" tab
4. Copy the values you need

### Via AWS CLI (if you add DescribeStacks permission)

```bash
# Auth Stack
aws cloudformation describe-stacks \
  --stack-name ProjectCICADAAuthStack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs'

# API Stack
aws cloudformation describe-stacks \
  --stack-name ProjectCICADAAPIStack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs'
```

## Cost Monitoring

- **Dashboard:** https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=CICADA-Monitoring
- **Cost Alarm:** Set up to alert if daily cost > $3
- **SNS Topic:** arn:aws:sns:us-east-1:461449807480:CICADA-Cost-Alerts

Subscribe to the SNS topic to get cost alerts:

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:461449807480:CICADA-Cost-Alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Resources Created

### Compute
- 3 Lambda Functions (WebSocketHandler, MessageProcessor, ProfileHandler)
- 1 Step Functions State Machine

### Storage
- 5 DynamoDB Tables (on-demand pricing)
- 2 S3 Buckets

### API
- 1 WebSocket API Gateway
- 1 REST API Gateway
- 1 SQS Queue

### Auth
- 1 Cognito User Pool
- 3 Users (admin, nick, naizak)

### Monitoring
- CloudWatch Dashboard
- Cost Alarm
- SNS Topic for alerts

## Troubleshooting

### Can't see CloudFormation outputs via CLI?

The IAM policy needs `cloudformation:DescribeStacks` permission. For now, use the AWS Console to view outputs.

### Frontend can't connect?

1. Verify you've set `VITE_WEBSOCKET_URL` and `VITE_API_URL` in `packages/frontend/.env.nonprod`
2. Check that the URLs match the CloudFormation outputs
3. Verify CORS settings in API Gateway

### Can't log in?

1. Make sure you've set passwords for the Cognito users (see step 3 above)
2. Verify the User Pool ID and Client ID are correct
3. Check that the user exists in Cognito

## Deployment Summary

✅ **All infrastructure deployed successfully!**
✅ **Total deployment time:** ~2 minutes
✅ **Cost:** Should be under $3/day with current usage

Next: Get the CloudFormation outputs and configure the frontend!
