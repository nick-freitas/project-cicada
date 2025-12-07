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
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)

### Installation

```bash
# Install dependencies for all packages
npm install

# Build all packages
npm run build
```

### Development

#### Frontend
```bash
cd packages/frontend
npm run dev
```

#### Backend
```bash
cd packages/backend
npm run build
npm test
```

#### Infrastructure
```bash
cd infrastructure
npm run synth    # Synthesize CloudFormation
npm run deploy   # Deploy to AWS
```

## Testing

```bash
# Run all tests
npm test

# Run tests for specific package
cd packages/backend
npm run test:unit
npm run test:integration
npm run test:property
```

## Architecture

- **Frontend**: React + Vite + TypeScript
- **Backend**: AWS Lambda + AgentCore + Strands SDK
- **Infrastructure**: AWS CDK (TypeScript)
- **AI**: Amazon Bedrock (Nova/Maverick)
- **Database**: DynamoDB
- **Storage**: S3 + Bedrock Knowledge Base

## Documentation

See `.kiro/specs/project-cicada/` for detailed:
- Requirements
- Design
- Implementation tasks
