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
- **Backend**: AWS Lambda + AgentCore + Strands SDK
- **Infrastructure**: AWS CDK (TypeScript) - Modular stacks for independent deployment
- **AI**: Amazon Bedrock (Nova/Maverick)
- **Database**: DynamoDB
- **Storage**: S3 + Bedrock Knowledge Base
- **Package Manager**: pnpm (monorepo with workspaces)

## Documentation

See `.kiro/specs/project-cicada/` for detailed:
- Requirements
- Design
- Implementation tasks
