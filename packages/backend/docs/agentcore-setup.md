# AgentCore SDK Setup

## Overview

This document explains the AWS AgentCore SDK setup for CICADA's multi-agent architecture.

## Important Note: "Strands SDK" Terminology

The design documents reference a "Strands SDK" for creating AgentCore agents. However, **AWS does not provide a separate Strands SDK package**. Instead, AgentCore agents are created and managed using:

1. **AWS CDK Constructs** (`aws-cdk-lib/aws-bedrock`) - For defining and deploying agents
2. **AWS SDK for JavaScript v3** (`@aws-sdk/client-bedrock-agent-runtime`) - For invoking agents at runtime

The term "Strands SDK" in the design documents should be understood as referring to these official AWS SDK packages.

## Installed Packages

### Backend Runtime (`packages/backend`)

```json
{
  "@aws-sdk/client-bedrock-agent-runtime": "^3.943.0",
  "@aws-sdk/client-bedrock-agent": "^3.943.0"
}
```

- **`@aws-sdk/client-bedrock-agent-runtime`**: Used to invoke AgentCore agents from Lambda functions
  - `BedrockAgentRuntimeClient` - Client for agent invocation
  - `InvokeAgentCommand` - Command to invoke an agent with streaming support
  - `InvokeFlowCommand` - Command to invoke agent flows

- **`@aws-sdk/client-bedrock-agent`**: Used for agent management operations (if needed)
  - `BedrockAgentClient` - Client for agent management
  - Various commands for creating, updating, and managing agents

### Infrastructure (`infrastructure`)

```json
{
  "@aws-sdk/client-bedrock-agent": "^3.943.0"
}
```

- Used in CDK stacks for agent configuration and management
- Provides types and utilities for agent definitions

## Usage Patterns

### Defining Agents (CDK)

Agents are defined using AWS CDK constructs in `infrastructure/lib/agent-stack.ts`:

```typescript
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

const orchestratorAgent = new bedrock.CfnAgent(this, 'OrchestratorAgent', {
  agentName: 'CICADA-Orchestrator',
  description: 'Central coordinator for CICADA multi-agent system',
  foundationModel: 'amazon.nova-lite-v1:0',
  instruction: orchestratorInstructions,
  agentResourceRoleArn: agentRole.roleArn,
});
```

### Invoking Agents (Runtime)

Agents are invoked from Lambda functions using the Bedrock Agent Runtime client:

```typescript
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

const command = new InvokeAgentCommand({
  agentId: process.env.ORCHESTRATOR_AGENT_ID,
  agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
  sessionId: sessionId,
  inputText: userQuery,
  enableTrace: true,
});

const response = await client.send(command);

// Process streaming response
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    const text = new TextDecoder().decode(chunk.chunk.bytes);
    // Handle chunk
  }
}
```

## Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CDK Infrastructure                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AgentStack (infrastructure/lib/agent-stack.ts)      │  │
│  │                                                       │  │
│  │  - Defines agents using bedrock.CfnAgent            │  │
│  │  - Configures IAM roles and permissions             │  │
│  │  - Sets up agent-to-agent invocation                │  │
│  │  - Exports agent IDs as stack outputs               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Deploys
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    AWS AgentCore                             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Orchestrator │  │ Query Agent  │  │ Theory Agent │     │
│  │    Agent     │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐                                           │
│  │ Profile Agent│                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Invoked by
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Lambda Functions                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Message Processor                                    │  │
│  │  (packages/backend/src/handlers/websocket/)          │  │
│  │                                                       │  │
│  │  - Uses BedrockAgentRuntimeClient                    │  │
│  │  - Invokes Orchestrator Agent                        │  │
│  │  - Handles streaming responses                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## TypeScript Configuration

Both `packages/backend` and `infrastructure` have TypeScript configurations that support:
- Strict type checking
- ES2020+ features
- CommonJS module system
- Node.js types
- JSON module resolution

No additional TypeScript configuration changes are needed for AgentCore support.

## Next Steps

1. Create `infrastructure/lib/agent-stack.ts` with agent definitions
2. Update message processor to use `BedrockAgentRuntimeClient`
3. Implement agent-to-agent invocation patterns
4. Configure IAM permissions for agent access
5. Test agent invocation and streaming

## References

- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS SDK for JavaScript v3 - Bedrock Agent Runtime](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent-runtime/)
- [AWS CDK Bedrock Constructs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrock-readme.html)
