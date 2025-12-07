# Project Structure

## Monorepo Organization

```
cicada-agent/
├── .kiro/
│   ├── specs/cicada-agent/     # Spec-driven development files
│   │   ├── requirements.md     # Detailed requirements
│   │   ├── design.md          # Architecture and design
│   │   └── tasks.md           # Implementation tasks
│   └── steering/              # AI assistant guidance
├── packages/
│   ├── shared-types/          # Shared TypeScript types
│   ├── frontend/              # React application
│   │   ├── src/
│   │   │   ├── components/    # React components
│   │   │   ├── pages/         # Page components
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   ├── services/      # API clients
│   │   │   └── utils/         # Utilities
│   │   └── vite.config.ts
│   └── backend/               # AWS Lambda functions
│       ├── src/
│       │   ├── agents/        # AgentCore agents
│       │   │   ├── orchestrator/
│       │   │   ├── query/
│       │   │   ├── theory/
│       │   │   └── profile/
│       │   ├── services/      # Business logic
│       │   │   ├── knowledge-base/
│       │   │   ├── profile/
│       │   │   └── memory/
│       │   ├── handlers/      # Lambda handlers
│       │   │   ├── websocket/
│       │   │   ├── rest-api/
│       │   │   └── ingestion/
│       │   └── utils/         # Utilities
│       └── test/
│           ├── unit/
│           ├── integration/
│           └── property/      # Property-based tests
├── infrastructure/            # AWS CDK stacks
│   ├── lib/
│   │   ├── data-stack.ts
│   │   ├── compute-stack.ts
│   │   ├── agent-stack.ts
│   │   ├── api-stack.ts
│   │   ├── auth-stack.ts
│   │   ├── frontend-stack.ts
│   │   └── monitoring-stack.ts
│   └── bin/
│       └── app.ts
└── package.json
```

## Key Directories

### `.kiro/specs/cicada-agent/`
Contains the spec-driven development artifacts:
- **requirements.md**: 28 detailed requirements with acceptance criteria
- **design.md**: Architecture, data models, agent coordination, correctness properties
- **tasks.md**: 29 implementation tasks with test requirements

### `packages/shared-types/`
TypeScript type definitions shared between frontend and backend:
- Script data models (ScriptMessage, EpisodeConfig)
- Profile models (Character, Location, Episode, FragmentGroup, Theory)
- Memory models (ConversationSession, Message)
- API request/response types

### `packages/frontend/`
React application with:
- Chat UI with WebSocket streaming
- Profile management interface
- Authentication UI
- Real-time reconnection handling

### `packages/backend/`
Lambda functions organized by responsibility:
- **agents/**: AgentCore agents using Strands SDK
- **services/**: Business logic (Knowledge Base, Profile, Memory)
- **handlers/**: Lambda entry points (WebSocket, REST API, data ingestion)

### `infrastructure/`
AWS CDK stacks defining all infrastructure:
- Data layer (S3, DynamoDB, Knowledge Base)
- Compute layer (Lambda, Step Functions)
- Agent layer (AgentCore agents)
- API layer (API Gateway REST + WebSocket)
- Auth layer (Cognito)
- Frontend layer (S3 + CloudFront)
- Monitoring layer (CloudWatch alarms, dashboards)

## Naming Conventions

- **Files**: kebab-case (e.g., `orchestrator-agent.ts`)
- **Components**: PascalCase (e.g., `ChatInterface.tsx`)
- **Functions**: camelCase (e.g., `processQuery()`)
- **Types/Interfaces**: PascalCase (e.g., `CharacterProfile`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_CONTEXT_SIZE`)
- **Lambda Functions**: PascalCase with suffix (e.g., `WebSocketHandlerFunction`)
- **DynamoDB Tables**: PascalCase (e.g., `UserProfiles`)

## Testing Organization

- **Unit tests**: Co-located with source in `__tests__/` directories
- **Integration tests**: `backend/test/integration/`
- **Property-based tests**: `backend/test/property/` (using fast-check, 100+ iterations)
- **E2E tests**: `frontend/test/e2e/` (using Playwright)

## Data Flow

1. User → Frontend (React)
2. Frontend → API Gateway (WebSocket/REST)
3. API Gateway → Lambda Handler
4. Lambda Handler → SQS/EventBridge
5. Step Functions → Orchestrator Agent
6. Orchestrator → Specialized Agents (Query/Theory/Profile)
7. Agents → Bedrock (AI inference) + DynamoDB (profiles) + Knowledge Base (script data)
8. Response streams back through WebSocket to Frontend
