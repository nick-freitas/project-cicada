# Non-Production Deployment Outputs

**Deployment Date:** December 7, 2024 (Updated with custom domain)  
**AWS Account:** 461449807480  
**Region:** us-east-1

## ✅ Deployment Status: SUCCESS

All 5 stacks deployed successfully:
- ✅ ProjectCICADADataStack
- ✅ ProjectCICADAAuthStack  
- ✅ ProjectCICADAAPIStack
- ✅ ProjectCICADAFrontendStack (with custom domain)
- ✅ ProjectCICADAMonitoringStack

## Key Outputs

### DataStack
- **KnowledgeBaseBucketName**: projectcicadadatastack-knowledgebaseb1c941bd-gmhdx7egxouo
- **ScriptDataBucketName**: projectcicadadatastack-scriptdataf7e49bc5-uqjsdje7v81e

### DynamoDB Tables
- **ConversationMemory**: ProjectCICADADataStack-ConversationMemoryA79C77FF-CV751IQV0D9Q
- **EpisodeConfiguration**: ProjectCICADADataStack-EpisodeConfiguration720ADACC-1G1UFATJMQ6P9
- **FragmentGroups**: ProjectCICADADataStack-FragmentGroups936AA7CE-1PYYI45VXPNKP
- **RequestTracking**: ProjectCICADADataStack-RequestTrackingCDC37650-1KSHB56TOWWUS
- **UserProfiles**: ProjectCICADADataStack-UserProfiles32DFB678-O2MGGLMVP0S2

### AuthStack
- **UserPoolId**: us-east-1_5aZxy0xjl
- **UserPoolClientId**: 2j1o52p6vhqp3dguptgpmfvp91
- **UserPoolArn**: arn:aws:cognito-idp:us-east-1:461449807480:userpool/us-east-1_5aZxy0xjl

### APIStack
- **WebSocketURL**: wss://0qqxq435yj.execute-api.us-east-1.amazonaws.com/prod
- **RestAPIURL**: https://bwanrcvaal.execute-api.us-east-1.amazonaws.com/prod/
- **WebSocketAPIId**: 0qqxq435yj
- **StateMachineArn**: arn:aws:states:us-east-1:461449807480:stateMachine:CICADA-Agent-Orchestration
- **MessageQueueName**: ProjectCICADAAPIStack-MessageQueue7A3BF959-oC4bvkRv2a6j

### FrontendStack (with Custom Domain)
- **FrontendURL**: https://dev-app.project-cicada.com ⭐ (Custom Domain)
- **CloudFrontURL**: https://d2owq6gm68xk87.cloudfront.net (Backup)
- **CustomDomain**: dev-app.project-cicada.com
- **BucketName**: projectcicadafrontendstack-frontendbucketefe2e19c-1v0hqfdap0vn
- **DistributionId**: E1YC4OTCEWC336

### MonitoringStack
- **DashboardURL**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=CICADA-Monitoring
- **BudgetURL**: https://console.aws.amazon.com/billing/home#/budgets
- **MonthlyBudgetLimit**: $100
- **DailyBudgetLimit**: $3.33
- **AlertEmail**: nickfrei@gmail.com

## Custom Domain Configuration

- **Domain**: project-cicada.com (registered with AWS Route53)
- **Nonprod Subdomain**: dev-app.project-cicada.com
- **ACM Certificate**: Auto-created and validated via DNS
- **Route53 A Record**: Points to CloudFront distribution
- **DNS Propagation**: In progress (typically 5-15 minutes, up to 48 hours max)

## Next Steps

### 1. Update Frontend Environment Variables

✅ **Already configured** in `packages/frontend/.env.nonprod`:

```bash
VITE_WEBSOCKET_URL=wss://0qqxq435yj.execute-api.us-east-1.amazonaws.com/prod
VITE_API_URL=https://bwanrcvaal.execute-api.us-east-1.amazonaws.com/prod/
VITE_USER_POOL_ID=us-east-1_5aZxy0xjl
VITE_USER_POOL_CLIENT_ID=2j1o52p6vhqp3dguptgpmfvp91
```

### 2. Create Cognito Users

✅ **Users already created** with emails from environment variables. To set passwords:

```bash
# Set password for admin
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_5aZxy0xjl \
  --username admin \
  --password "YourSecurePassword123!" \
  --permanent

# Set password for nick
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_5aZxy0xjl \
  --username nick \
  --password "YourSecurePassword123!" \
  --permanent

# Set password for naizak
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_5aZxy0xjl \
  --username naizak \
  --password "YourSecurePassword123!" \
  --permanent
```

Or use the **Forgot Password** feature on the login page to reset via email.

### 3. Upload Script Data

Upload Higurashi script data to the ScriptDataBucket:

```bash
aws s3 cp ./script-data/ s3://projectcicadadatastack-scriptdataf7e49bc5-uqjsdje7v81e/ --recursive
```

### 4. Test the Application

Access the frontend at:
- **Primary**: https://dev-app.project-cicada.com
- **Backup**: https://d2owq6gm68xk87.cloudfront.net

Test:
- Authentication flow
- WebSocket connection
- Query processing
- Profile management

### 5. Monitor Costs

- **Dashboard**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=CICADA-Monitoring
- **Budgets**: https://console.aws.amazon.com/billing/home#/budgets
- **Email Alerts**: nickfrei@gmail.com will receive alerts at 80% monthly and 100% daily thresholds

## Cost Monitoring

- **Monthly Budget**: $100 (alert at 80% = $80)
- **Daily Budget**: $3.33 (alert at 100% = $3.33)
- **Alert Email**: nickfrei@gmail.com
- **Forecasted Overage**: Enabled

## Infrastructure Summary

### Compute
- 3 Lambda Functions (WebSocketHandler, MessageProcessor, ProfileHandler)
- 1 Step Functions State Machine

### Storage
- 5 DynamoDB Tables (on-demand pricing)
- 3 S3 Buckets (Script Data, Knowledge Base, Frontend)

### API & Networking
- 1 WebSocket API Gateway
- 1 REST API Gateway
- 1 SQS Queue
- 1 CloudFront Distribution (with custom domain)
- 1 Route53 A Record
- 1 ACM Certificate

### Auth
- 1 Cognito User Pool
- Users: To be created (admin, nick, naizak)

### Monitoring
- 1 CloudWatch Dashboard
- 2 AWS Budgets (Monthly + Daily)

## Troubleshooting

### Custom domain not working?

1. **Wait for DNS propagation** (5-15 minutes typical, up to 48 hours)
2. **Check certificate status** in ACM console (should be "Issued")
3. **Verify Route53 record** exists for dev-app.project-cicada.com
4. **Use CloudFront URL as backup** while DNS propagates

### Frontend can't connect?

1. Verify environment variables in `packages/frontend/.env.nonprod`
2. Check that URLs match the deployment outputs
3. Verify CORS settings in API Gateway

### Can't log in?

1. Create users in Cognito (see step 2 above)
2. Set permanent passwords
3. Verify User Pool ID and Client ID are correct

## Deployment Summary

✅ **All infrastructure deployed successfully!**  
✅ **Custom domain configured**: https://dev-app.project-cicada.com  
✅ **Total stacks**: 5 (simplified from 7)  
✅ **Estimated cost**: Under $3/day with current usage  

Next: Create Cognito users and configure the frontend environment variables!
