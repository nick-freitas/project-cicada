# Technology Stack

## Language & Type System

- **TypeScript**: All code (frontend, backend, infrastructure) uses TypeScript with strict type checking
- **Shared Types**: Common types package shared across frontend and backend

## Frontend

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router
- **State Management**: Context API
- **WebSocket Client**: Native WebSocket API for real-time streaming
- **Authentication**: AWS Amplify + Cognito integration

## Backend

- **Infrastructure as Code**: AWS CDK in TypeScript
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
cd frontend
npm install
npm run dev

# Build
npm run build

# Test
npm test
npm run test:e2e
```

### Backend
```bash
# Development
cd backend
npm install
npm run build

# Deploy
npm run cdk:synth
npm run cdk:deploy

# Test
npm test
npm run test:integration
```

### Infrastructure
```bash
# Synthesize CloudFormation
cdk synth

# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy CICADADataStack

# Destroy infrastructure
cdk destroy --all
```

## Architecture Patterns

- **Serverless**: All compute is Lambda-based for cost optimization
- **Event-Driven**: EventBridge and SQS for decoupled async processing
- **Multi-Agent**: Specialized agents (Query, Theory, Profile) coordinated by Orchestrator
- **Streaming**: Real-time response delivery via WebSocket with reconnection support
- **User-Scoped**: All data (profiles, theories, memory) isolated per user
