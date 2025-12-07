# IAM Setup for Least-Privilege CDK Deployment

This guide shows how to create an IAM user with minimal permissions needed for CDK deployment.

## Quick Setup (AWS Console)

### 1. Create IAM User

1. Go to AWS Console → IAM → Users
2. Click "Create user"
3. Username: `cicada-deployer`
4. Select "Provide user access to the AWS Management Console" (optional)
5. Click "Next"

### 2. Attach Custom Policy

1. Select "Attach policies directly"
2. Click "Create policy"
3. Click "JSON" tab
4. Copy the contents of `iam-policy-cdk-deploy.json`
5. Paste into the JSON editor
6. Click "Next"
7. Policy name: `CICADACDKDeployPolicy`
8. Description: "Least-privilege policy for CICADA CDK deployment"
9. Click "Create policy"
10. Go back to user creation, refresh policies, and select `CICADACDKDeployPolicy`
11. Click "Next" → "Create user"

### 3. Create Access Keys

1. Go to the user you just created
2. Click "Security credentials" tab
3. Scroll to "Access keys"
4. Click "Create access key"
5. Select "Command Line Interface (CLI)"
6. Check the confirmation box
7. Click "Next" → "Create access key"
8. **Save the Access Key ID and Secret Access Key** (you won't see the secret again!)

### 4. Configure AWS CLI

```bash
# Configure AWS CLI with the new credentials
aws configure --profile cicada-deployer

# Enter the Access Key ID
# Enter the Secret Access Key
# Default region: us-east-1
# Default output format: json

# Test the credentials
aws sts get-caller-identity --profile cicada-deployer

# Use this profile for deployment
export AWS_PROFILE=cicada-deployer
```

## What This Policy Allows

### ✅ Allowed Actions

**CloudFormation:**
- Create, update, delete CDK stacks
- Describe stack status and resources

**S3:**
- Create CDK asset buckets
- Upload Lambda code and assets
- Create application buckets (script data, knowledge base)

**DynamoDB:**
- Create, update, delete tables
- Configure TTL and backups

**Lambda:**
- Create, update, delete functions
- Manage event source mappings (SQS triggers)
- Update function code and configuration

**IAM:**
- Create roles for Lambda, Step Functions, Bedrock
- Attach managed policies
- Create inline policies
- **Limited to resources with "CICADA" or "cdk-" prefix**

**Cognito:**
- Create, update, delete User Pools
- Create User Pool Clients
- Create initial users
- Set user passwords

**API Gateway:**
- Create REST and WebSocket APIs
- Configure routes and integrations

**SQS:**
- Create, update, delete queues

**Step Functions:**
- Create, update, delete state machines

**CloudWatch:**
- Create log groups for Lambda
- Create alarms and dashboards

**EventBridge:**
- Create rules for event routing

### ❌ Not Allowed

- Creating EC2 instances
- Creating RDS databases
- Creating VPCs or networking resources
- Modifying other AWS accounts
- Creating IAM users or groups
- Accessing resources outside CICADA namespace

## Alternative: Use Existing Admin User

If you already have an admin user and want to use it:

```bash
# Just configure AWS CLI with your existing credentials
aws configure

# Or use an existing profile
export AWS_PROFILE=your-admin-profile
```

**Note:** Admin access is easier but less secure. The custom policy above follows least-privilege principles.

## Policy Breakdown

### Core CDK Permissions
```json
{
  "CloudFormation": "Create and manage CDK stacks",
  "S3": "Store CDK assets and Lambda code",
  "IAM": "Create roles for AWS services (limited to CICADA* and cdk-* resources)",
  "SSM": "Store CDK bootstrap parameters"
}
```

### Application Resources
```json
{
  "DynamoDB": "Create tables for user data",
  "Lambda": "Deploy serverless functions",
  "Cognito": "Manage user authentication",
  "API Gateway": "Create REST and WebSocket APIs",
  "SQS": "Create message queues",
  "Step Functions": "Create agent orchestration workflows",
  "CloudWatch": "Create logs, alarms, and dashboards",
  "EventBridge": "Create event routing rules"
}
```

### Read-Only Permissions
```json
{
  "sts:GetCallerIdentity": "Verify AWS account",
  "ec2:DescribeAvailabilityZones": "Get region information",
  "iam:GetUser": "Verify user identity"
}
```

## Security Best Practices

### 1. Use Separate Users for Environments

```bash
# Create separate users for nonprod and prod
cicada-deployer-nonprod
cicada-deployer-prod
```

### 2. Rotate Access Keys Regularly

```bash
# Create new access key
aws iam create-access-key --user-name cicada-deployer

# Update AWS CLI config
aws configure --profile cicada-deployer

# Delete old access key
aws iam delete-access-key --user-name cicada-deployer --access-key-id OLD_KEY_ID
```

### 3. Enable MFA (Multi-Factor Authentication)

1. Go to IAM → Users → cicada-deployer
2. Click "Security credentials"
3. Click "Assign MFA device"
4. Follow the setup wizard

### 4. Use AWS Organizations for Multi-Account Setup

For production, consider:
- Separate AWS accounts for nonprod and prod
- Use AWS Organizations to manage accounts
- Use cross-account roles for deployment

### 5. Monitor IAM Activity

```bash
# Check recent IAM activity
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=cicada-deployer \
  --max-results 10
```

## Troubleshooting

### "Access Denied" Errors

If you get access denied errors during deployment:

1. **Check the resource name:** Policy only allows resources with "CICADA" prefix
2. **Check the action:** Verify the action is in the policy
3. **Check CloudFormation events:** See which specific action failed
4. **Add missing permission:** Update the policy and reattach

### Testing Permissions

```bash
# Test CloudFormation access
aws cloudformation describe-stacks --profile cicada-deployer

# Test S3 access
aws s3 ls --profile cicada-deployer

# Test Lambda access
aws lambda list-functions --profile cicada-deployer

# Test DynamoDB access
aws dynamodb list-tables --profile cicada-deployer
```

### Updating the Policy

If you need to add permissions:

1. Go to IAM → Policies → CICADACDKDeployPolicy
2. Click "Edit"
3. Add the required permissions
4. Click "Save changes"
5. The user automatically gets the new permissions

## Cost Considerations

This IAM user has permissions to create resources that cost money:
- DynamoDB tables (on-demand pricing)
- Lambda functions (per-invocation)
- API Gateway (per-request)
- S3 storage
- CloudWatch logs

**Recommendation:** Set up billing alerts and use the MonitoringStack to track costs.

## Cleanup

To remove the IAM user:

```bash
# Delete access keys
aws iam list-access-keys --user-name cicada-deployer
aws iam delete-access-key --user-name cicada-deployer --access-key-id KEY_ID

# Detach policies
aws iam detach-user-policy \
  --user-name cicada-deployer \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/CICADACDKDeployPolicy

# Delete user
aws iam delete-user --user-name cicada-deployer

# Delete policy
aws iam delete-policy \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/CICADACDKDeployPolicy
```
