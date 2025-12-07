# Technology Stack

## Language & Type System

- **TypeScript**: All code (frontend, backend, infrastructure) uses TypeScript with strict type checking
- **Shared Types**: Common types package shared across frontend and backend

## Package Management

- **pnpm**: Use pnpm for all package management (faster, more efficient than npm)
- **Workspaces**: Monorepo managed with pnpm workspaces

## Frontend

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS for utility-first styling
- **Routing**: React Router
- **State Management**: Context API
- **WebSocket Client**: Native WebSocket API for real-time streaming
- **Authentication**: AWS Amplify + Cognito integration

## Backend

- **Infrastructure as Code**: AWS CDK (Cloud Development Kit) in TypeScript
  - **NOT CloudFormation directly** - always use CDK constructs
  - Infrastructure split into separate stacks for independent deployment:
    - `DataStack`: DynamoDB tables, S3 buckets, Knowledge Base
    - `ComputeStack`: Lambda functions, Step Functions
    - `AgentStack`: AgentCore agents (Orchestrator, Query, Theory, Profile)
    - `APIStack`: API Gateway (REST + WebSocket), SQS queues
    - `AuthStack`: Cognito User Pool and clients
    - `FrontendStack`: S3 + CloudFront for static hosting
    - `MonitoringStack`: CloudWatch alarms, dashboards, cost monitoring
- **Compute**: AWS Lambda (serverless)
- **Agent Framework**: AWS AgentCore with Strands SDK (TypeScript)
- **AI Models**: Amazon Bedrock (Nova Lite/Micro or Maverick)
- **API**: API Gateway (REST + WebSocket)
- **Orchestration**: AWS Step Functions + EventBridge + SQS
- **Database**: DynamoDB (on-demand pricing)
- **Storage**: S3 for script data and frontend hosting
- **Knowledge Base**: Bedrock Knowledge Base with Titan Embeddings
- **Authentication**: AWS Cognito User Pools
- **CDN**: CloudFront for frontend distribution

## Development Tools

- **Linting**: ESLint
- **Formatting**: Prettier
- **Testing**: Jest (unit/integration), Playwright (E2E), fast-check (property-based)
- **Evaluation**: AWS Evals for model performance

## Common Commands

### Frontend
```bash
# Development
cd packages/frontend
pnpm install
pnpm run dev

# Build
pnpm run build

# Test
pnpm test
pnpm run test:e2e
```

### Backend
```bash
# Development
cd packages/backend
pnpm install
pnpm run build

# Test
pnpm test
pnpm run test:integration
pnpm run test:property
```

### Infrastructure (AWS CDK)
```bash
cd infrastructure

# Install dependencies
pnpm install

# Synthesize CDK to CloudFormation (review before deploying)
pnpm run synth

# Deploy all stacks
pnpm run deploy

# Deploy specific stack (recommended for targeted updates)
cdk deploy CICADADataStack
cdk deploy CICADAAuthStack
cdk deploy CICADAAPIStack
cdk deploy CICADAMonitoringStack

# Destroy infrastructure
cdk destroy --all

# List all stacks
cdk list
```

### Monorepo Commands (from root)
```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests across all packages
pnpm test
```

## Architecture Patterns

- **Serverless**: All compute is Lambda-based for cost optimization
- **Event-Driven**: EventBridge and SQS for decoupled async processing
- **Multi-Agent**: Specialized agents (Query, Theory, Profile) coordinated by Orchestrator
- **Streaming**: Real-time response delivery via WebSocket with reconnection support
- **User-Scoped**: All data (profiles, theories, memory) isolated per user
- **Modular Infrastructure**: CDK stacks are split by concern for independent deployment
  - Deploy only what changed (e.g., update API without touching data layer)
  - Reduces deployment time and risk
  - Clear separation of concerns

## Infrastructure Deployment Strategy

When deploying infrastructure changes:

1. **Always use CDK** - Never write CloudFormation directly
2. **Deploy stacks independently** when possible:
   - Data layer changes: `cdk deploy CICADADataStack`
   - API changes: `cdk deploy CICADAAPIStack`
   - Auth changes: `cdk deploy CICADAAuthStack`
   - Monitoring changes: `cdk deploy CICADAMonitoringStack`
3. **Use `cdk diff`** before deploying to review changes
4. **Deploy all stacks** only when necessary: `cdk deploy --all`
5. **Stack dependencies** are managed automatically by CDK
