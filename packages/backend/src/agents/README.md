# CICADA AgentCore Module

This module provides the foundation for building AgentCore agents using the Strands SDK. It includes base classes, types, and utilities for creating specialized agents with deterministic tool invocation.

## Installation

The Strands SDK has been installed:

```bash
pnpm add @strands-agents/sdk zod --filter @cicada/backend
```

## Package Information

- **Package**: `@strands-agents/sdk` v0.1.2
- **Repository**: https://github.com/strands-agents/sdk-typescript
- **Documentation**: https://strandsagents.com/

## Module Structure

```
src/agents/
├── base/
│   ├── agent-base.ts       # Base class for all CICADA agents
│   ├── tool-base.ts        # Base class for agent tools
│   └── index.ts            # Exports for base classes
├── types/
│   ├── identity.ts         # User identity and policy types
│   ├── memory.ts           # Conversation memory types
│   └── index.ts            # Exports for types
├── index.ts                # Main module exports
└── README.md               # This file
```

## Base Classes

### CICADAAgentBase

Base class for all CICADA agents. Extends the Strands SDK `Agent` class with CICADA-specific functionality:

- **Identity Management**: Validates and enforces user identity
- **Memory Integration**: Extracts conversation context from memory
- **Logging**: Structured logging for debugging and monitoring
- **Error Handling**: User-friendly error formatting

**Usage:**

```typescript
import { CICADAAgentBase, AgentInvocationParams, AgentInvocationResult } from './base';

class MyAgent extends CICADAAgentBase {
  constructor() {
    super({
      name: 'CICADA-MyAgent',
      description: 'My specialized agent',
      systemPrompt: 'You are a helpful assistant...',
      modelId: 'amazon.nova-pro-v1:0',
      maxTokens: 2048,
      temperature: 0.7,
    });
  }

  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    // Validate identity
    this.validateIdentity(params.identity);

    // Extract context from memory
    const context = this.extractContext(params.memory);

    // Your agent logic here
    const response = await this.invoke(params.query);

    return {
      content: response,
      metadata: {
        agentsInvoked: ['MyAgent'],
        toolsUsed: [],
      },
    };
  }
}
```

### CICADAToolBase

Base class for defining tools that agents can invoke:

- **Input Validation**: Uses Zod schemas for type-safe input validation
- **Output Validation**: Optional output schema validation
- **Error Handling**: Automatic error catching and formatting
- **Logging**: Structured logging for tool invocations

**Usage:**

```typescript
import { CICADAToolBase, ToolConfig, ToolExecutionContext } from './base';
import { z } from 'zod';

// Define input schema
const searchInputSchema = z.object({
  query: z.string(),
  topK: z.number().optional(),
  minScore: z.number().optional(),
});

type SearchInput = z.infer<typeof searchInputSchema>;

// Define output type
interface SearchOutput {
  results: Array<{
    text: string;
    score: number;
  }>;
}

class SemanticSearchTool extends CICADAToolBase<SearchInput, SearchOutput> {
  constructor() {
    super({
      name: 'semantic_search',
      description: 'Search the knowledge base using semantic similarity',
      inputSchema: searchInputSchema,
    });
  }

  protected async executeInternal(
    input: SearchInput,
    context: ToolExecutionContext
  ): Promise<SearchOutput> {
    // Your tool logic here
    const results = await performSearch(input.query, {
      topK: input.topK || 20,
      minScore: input.minScore || 0.5,
    });

    return { results };
  }
}
```

## Type Definitions

### UserIdentity

Represents user identity for access control and data isolation:

```typescript
interface UserIdentity {
  userId: string;
  username: string;
  groups?: string[];
  attributes?: Record<string, string>;
}
```

### ConversationMemory

Represents conversation history for maintaining context:

```typescript
interface ConversationMemory {
  userId: string;
  sessionId: string;
  messages: Message[];
  summary?: string;
  lastAccessed: Date;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    agentName?: string;
    toolsUsed?: string[];
    tokenUsage?: { input: number; output: number };
  };
}
```

## Strands SDK Integration

The Strands SDK provides:

- **Agent Class**: Core agent orchestration with model invocation
- **Tool System**: Type-safe tool definitions using Zod schemas
- **Streaming Support**: Real-time response streaming
- **Model Providers**: Built-in support for Amazon Bedrock and OpenAI
- **Hooks**: Lifecycle hooks for monitoring and customization
- **Conversation Management**: Flexible strategies for managing context

### Key Exports

```typescript
import {
  Agent,              // Base agent class
  AgentConfig,        // Agent configuration type
  FunctionTool,       // Function-based tool class
  tool,               // Zod-based tool helper
  Tool,               // Tool interface
  ToolContext,        // Tool execution context
  BedrockModel,       // Bedrock model provider
} from '@strands-agents/sdk';
```

## Configuration

### TypeScript Configuration

The backend TypeScript configuration supports:
- ES2022 target
- CommonJS modules
- Strict type checking
- JSON module resolution
- Node.js types

No additional configuration is needed for AgentCore support.

### Environment Variables

Agents will use the following environment variables:

```bash
# AWS Region
AWS_REGION=us-east-1

# Bedrock Model IDs
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0

# Agent IDs (populated by CDK)
ORCHESTRATOR_AGENT_ID=<agent-id>
QUERY_AGENT_ID=<agent-id>
THEORY_AGENT_ID=<agent-id>
PROFILE_AGENT_ID=<agent-id>
```

## Next Steps

1. **Implement Gateway Service** (Task 5)
   - Create Gateway class as entry point
   - Integrate Identity, Policy, and Memory services

2. **Implement Identity Service** (Task 2)
   - Create IdentityService class
   - Integrate with Cognito

3. **Implement Policy Service** (Task 3)
   - Create PolicyService class
   - Implement access control and rate limiting

4. **Implement Memory Service** (Task 4)
   - Create MemoryService class
   - Integrate with DynamoDB

5. **Implement Specialized Agents** (Tasks 6-9)
   - Query Agent with semantic search
   - Orchestrator Agent with routing logic
   - Theory Agent with evidence gathering
   - Profile Agent with profile management

## Testing

### Unit Tests

Test agents with mocked dependencies:

```typescript
import { CICADAAgentBase } from './base';

describe('MyAgent', () => {
  it('should validate identity', async () => {
    const agent = new MyAgent();
    
    await expect(
      agent.invokeAgent({
        query: 'test',
        identity: { userId: '', username: '' },
        memory: { userId: '', sessionId: '', messages: [], lastAccessed: new Date() },
      })
    ).rejects.toThrow('User identity is required');
  });
});
```

### Property-Based Tests

Test correctness properties using fast-check:

```typescript
import * as fc from 'fast-check';

describe('Property: Identity Propagation', () => {
  it('should pass identity to all invoked agents', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (userId, username) => {
          const identity = { userId, username };
          const result = await agent.invokeAgent({
            query: 'test',
            identity,
            memory: { userId, sessionId: 'test', messages: [], lastAccessed: new Date() },
          });
          
          // Verify identity was used
          expect(result.metadata?.agentsInvoked).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

## References

- [Strands SDK Documentation](https://strandsagents.com/)
- [Strands SDK GitHub](https://github.com/strands-agents/sdk-typescript)
- [AgentCore Migration Design](.kiro/specs/agentcore-migration/design.md)
- [AgentCore Migration Requirements](.kiro/specs/agentcore-migration/requirements.md)
- [Zod Documentation](https://zod.dev/)
