# Project CICADA

**CICADA** - Contextual Inference & Comprehensive Analysis Data Agent

A full-stack AI agent system for analyzing the visual novel "Higurashi no Naku Koro Ni".

**Domain:** project-cicada.com

## Project Structure

```
project-cicada/
├── packages/
│   ├── shared-types/      # Shared TypeScript types
│   ├── frontend/          # React application (Vite)
│   └── backend/           # Lambda functions and services
├── infrastructure/        # AWS CDK stacks
└── .kiro/                # Spec-driven development files
```

## About

Project CICADA is designed to help users explore and analyze the complex narrative of Higurashi no Naku Koro Ni through natural conversation with specialized AI agents. The system maintains strict episode boundaries to prevent mixing contradictory information from different story fragments while supporting cross-episode analysis when explicitly requested.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)

### Installation

```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm run build
```

### Development

#### Frontend
```bash
cd packages/frontend
pnpm run dev
```

#### Backend
```bash
cd packages/backend
pnpm run build
pnpm test
```

#### Infrastructure (AWS CDK)
```bash
cd infrastructure
pnpm run synth    # Synthesize CDK to CloudFormation
pnpm run deploy   # Deploy all stacks

# Deploy specific stack (recommended)
cdk deploy CICADADataStack
cdk deploy CICADAAPIStack
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/backend
pnpm run test:unit
pnpm run test:integration
pnpm run test:property
```

## Architecture

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: AWS Lambda + AgentCore multi-agent system
- **Infrastructure**: AWS CDK (TypeScript) - Modular stacks for independent deployment
- **AI**: Amazon Bedrock (Nova Lite for agents, Titan for embeddings)
- **Database**: DynamoDB
- **Storage**: S3 + Bedrock Knowledge Base
- **Package Manager**: pnpm (monorepo with workspaces)

### Multi-Agent Architecture

CICADA uses AWS AgentCore to implement a specialized multi-agent system:

- **Orchestrator Agent**: Central coordinator that analyzes query intent and routes to specialized agents
- **Query Agent**: Script search and citation specialist with semantic search capabilities
- **Theory Agent**: Theory analysis and validation specialist with evidence gathering
- **Profile Agent**: Knowledge extraction and profile management specialist

All agents use Amazon Nova Lite for cost-effective operation within the $100/month budget.

See [AgentCore Architecture](packages/backend/docs/AGENTCORE_ARCHITECTURE.md) for detailed information.

## Documentation

### Deployment & Setup Guides
- [Deployment Guide](docs/DEPLOYMENT.md) - Step-by-step deployment instructions
- [Environment Setup](docs/ENV_SETUP.md) - Environment variable configuration
- [IAM Setup](docs/IAM_SETUP.md) - AWS IAM user and permissions setup
- [Custom Domain Setup](docs/CUSTOM_DOMAIN_SETUP.md) - Configure custom domain for frontend
- [AWS Budgets Guide](docs/AWS_BUDGETS_GUIDE.md) - Cost monitoring and budget alerts
- [Nonprod Deployment Outputs](docs/NONPROD_DEPLOYMENT_OUTPUTS.md) - Current nonprod deployment details
- [Architecture Diagrams](docs/ARCHITECTURE_DIAGRAMS.md) - Visual architecture diagrams with Mermaid

### Architecture & Development
- **[Backend Documentation Index](packages/backend/docs/README.md)** - Complete backend documentation hub
- [AgentCore Architecture](packages/backend/docs/AGENTCORE_ARCHITECTURE.md) - Multi-agent system architecture and patterns
- [Agent Invocation Examples](packages/backend/docs/AGENT_INVOCATION_EXAMPLES.md) - Practical examples of agent invocation
- [Streaming Implementation](packages/backend/docs/STREAMING_IMPLEMENTATION.md) - Real-time streaming with WebSocket
- [AgentCore Quick Reference](packages/backend/docs/AGENTCORE_QUICK_REFERENCE.md) - Quick reference guide
- [AgentCore Setup](packages/backend/docs/agentcore-setup.md) - SDK setup and configuration
- [Monitoring and Observability](packages/backend/docs/monitoring-and-observability.md) - CloudWatch metrics and logging
- [Performance Testing Guide](packages/backend/docs/performance-testing-guide.md) - Performance optimization strategies
- [Infrastructure Cleanup](docs/INFRASTRUCTURE_CLEANUP.md) - Stack simplification notes
- [Spec Files](.kiro/specs/project-cicada/) - Requirements, design, and implementation tasks
