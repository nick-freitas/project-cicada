# Environment Configuration Guide

This project uses environment-specific configuration files to manage different deployment environments.

## Environment Files

### Root Level (Backend & Infrastructure)
- `.env.example` - Template showing all available environment variables
- `.env.nonprod` - Non-production environment configuration (gitignored)
- `.env.prod` - Production environment configuration (gitignored)

### Frontend (`packages/frontend/`)
- `.env.development` - Local development (committed, uses localhost)
- `.env.nonprod` - Non-production environment (gitignored)
- `.env.production` - Production environment (gitignored)

## Setup Instructions

### 1. Copy Environment Files

```bash
# Copy and fill in nonprod values
cp .env.nonprod .env.nonprod.local
# Edit .env.nonprod with your actual values

# Copy and fill in prod values
cp .env.prod .env.prod.local
# Edit .env.prod with your actual values

# Frontend nonprod
cp packages/frontend/.env.nonprod packages/frontend/.env.nonprod.local
# Edit with your nonprod frontend URLs

# Frontend prod
cp packages/frontend/.env.production packages/frontend/.env.production.local
# Edit with your prod frontend URLs
```

### 2. Fill in Required Values

#### Backend/Infrastructure Variables:
- `CDK_DEFAULT_ACCOUNT` - Your AWS account ID
- `USER_POOL_ID` - Cognito User Pool ID (from deployment)
- `USER_POOL_CLIENT_ID` - Cognito Client ID (from deployment)
- `MESSAGE_QUEUE_URL` - SQS Queue URL (from deployment)
- `WEBSOCKET_DOMAIN_NAME` - WebSocket API domain (from deployment)
- `STATE_MACHINE_ARN` - Step Functions ARN (from deployment)

#### Frontend Variables:
- `VITE_WEBSOCKET_URL` - WebSocket API URL (wss://your-domain)
- `VITE_API_URL` - REST API URL (https://your-domain)

## Available Commands

### Development (Local)
```bash
# Frontend dev server (uses .env.development)
pnpm dev:frontend

# Backend build
pnpm dev:backend
```

### Non-Production
```bash
# Build all packages for nonprod
pnpm build:nonprod

# Frontend dev server with nonprod config
pnpm --filter @cicada/frontend run dev:nonprod

# Deploy to nonprod
pnpm deploy:nonprod

# Synth CDK for nonprod
pnpm synth:nonprod
```

### Production
```bash
# Build all packages for prod
pnpm build:prod

# Deploy to prod
pnpm deploy:prod

# Synth CDK for prod
pnpm synth:prod
```

## Environment Variable Reference

### AWS Configuration
- `AWS_REGION` - AWS region (default: us-east-1)
- `CDK_DEFAULT_ACCOUNT` - AWS account ID for CDK
- `CDK_DEFAULT_REGION` - AWS region for CDK

### DynamoDB Tables
- `EPISODE_CONFIG_TABLE_NAME` - Episode configuration table
- `CONVERSATION_MEMORY_TABLE` - Conversation history table
- `USER_PROFILES_TABLE` - User profiles table
- `REQUEST_TRACKING_TABLE` - Request tracking table
- `CONNECTIONS_TABLE` - WebSocket connections table

### S3 Buckets
- `SCRIPT_BUCKET_NAME` - Script data bucket
- `KB_BUCKET_NAME` - Knowledge base bucket
- `KNOWLEDGE_BASE_BUCKET` - Knowledge base bucket (alias)

### Cognito
- `USER_POOL_ID` - Cognito User Pool ID
- `USER_POOL_CLIENT_ID` - Cognito App Client ID

### API Gateway
- `MESSAGE_QUEUE_URL` - SQS queue URL for message processing
- `WEBSOCKET_DOMAIN_NAME` - WebSocket API domain
- `WEBSOCKET_STAGE` - API stage (nonprod/prod)

### Step Functions
- `STATE_MACHINE_ARN` - Step Functions state machine ARN

### AI Model
- `MODEL_ID` - Bedrock model ID (default: amazon.nova-lite-v1:0)

### Frontend (VITE_ prefix required)
- `VITE_WEBSOCKET_URL` - WebSocket API endpoint
- `VITE_API_URL` - REST API endpoint

## Security Notes

1. **Never commit actual environment files** - They are gitignored for security
2. **Use .env.example as reference** - It shows all available variables
3. **3-day minimum package age** - Configured in `.npmrc` for supply chain security
4. **Separate environments** - Keep nonprod and prod configurations separate

## Troubleshooting

### Missing Environment Variables
If you see errors about missing environment variables:
1. Check that you've copied and filled in the appropriate `.env.*` file
2. Verify the file is in the correct location (root for backend/infra, `packages/frontend/` for frontend)
3. Restart your dev server after changing environment files

### CDK Deployment Issues
If CDK can't find your account:
1. Ensure `CDK_DEFAULT_ACCOUNT` is set in your environment file
2. Run `aws configure` to set up AWS credentials
3. Verify credentials with `aws sts get-caller-identity`
