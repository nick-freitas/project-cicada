# AgentCore Lambda Handlers

This directory contains Lambda handler functions for the AgentCore multi-agent system.

## Overview

The AgentCore system uses Lambda functions to implement a multi-agent architecture with deterministic tool invocation. Each agent runs as a separate Lambda function, providing:

- **Deterministic behavior**: Explicit orchestration logic (no autonomous decisions)
- **Cost efficiency**: Lambda-based execution (pay per invocation)
- **Scalability**: Automatic scaling with Lambda
- **Observability**: Full visibility into agent execution

## Lambda Functions

### Gateway Handler (`gateway-handler.ts`)

**Purpose**: Entry point for all AgentCore requests

**Responsibilities**:
- Extract request parameters from API Gateway events
- Validate user identity and enforce policies
- Load conversation memory
- Route to Orchestrator or specific agents
- Handle errors and retries
- Return responses in API Gateway format

**Environment Variables**:
- `ORCHESTRATOR_FUNCTION_ARN`: ARN of Orchestrator Lambda
- `QUERY_FUNCTION_ARN`: ARN of Query Agent Lambda
- `THEORY_FUNCTION_ARN`: ARN of Theory Agent Lambda
- `PROFILE_FUNCTION_ARN`: ARN of Profile Agent Lambda
- `USER_PROFILES_TABLE`: DynamoDB table for user profiles
- `CONVERSATION_MEMORY_TABLE`: DynamoDB table for conversation memory
- `KNOWLEDGE_BASE_BUCKET`: S3 bucket for knowledge base
- `MODEL_ID`: Bedrock model ID (default: amazon.nova-pro-v1:0)

**Memory**: 512 MB  
**Timeout**: 300 seconds (5 minutes)

**Requirements**: 1.3, 1.4, 8.1, 8.2, 8.3, 8.4, 8.5

---

### Orchestrator Handler (`orchestrator-handler.ts`)

**Purpose**: Central coordinator that routes queries to specialized agents

**Responsibilities**:
- Classify queries using explicit keyword-based logic
- Route to Query, Theory, or Profile agents
- Log all routing decisions
- Coordinate multi-agent workflows

**Environment Variables**:
- `QUERY_FUNCTION_ARN`: ARN of Query Agent Lambda
- `THEORY_FUNCTION_ARN`: ARN of Theory Agent Lambda
- `PROFILE_FUNCTION_ARN`: ARN of Profile Agent Lambda
- `MODEL_ID`: Bedrock model ID (default: amazon.nova-pro-v1:0)

**Memory**: 512 MB  
**Timeout**: 300 seconds (5 minutes)

**Requirements**: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5

---

### Query Agent Handler (`query-handler.ts`)

**Purpose**: Script search and citation specialist

**Responsibilities**:
- ALWAYS invoke semantic search (deterministic behavior)
- Format results with complete citations
- Handle empty results honestly (no hallucination)
- Maintain episode boundaries

**Environment Variables**:
- `KNOWLEDGE_BASE_BUCKET`: S3 bucket for knowledge base embeddings
- `MODEL_ID`: Bedrock model ID (default: amazon.nova-pro-v1:0)
- `MAX_EMBEDDINGS_TO_LOAD`: Maximum embeddings to load (default: 3000)

**Memory**: 1024 MB (1 GB)  
**Timeout**: 300 seconds (5 minutes)

**Requirements**: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5

---

### Theory Agent Handler (`theory-handler.ts`)

**Purpose**: Theory analysis and validation specialist

**Responsibilities**:
- Extract theory statements from queries
- Invoke Query Agent to gather evidence
- Analyze theories against evidence
- Update theory profiles in DynamoDB
- Determine theory status (proposed/supported/refuted/refined)

**Environment Variables**:
- `QUERY_FUNCTION_ARN`: ARN of Query Agent Lambda
- `USER_PROFILES_TABLE`: DynamoDB table for user profiles
- `MODEL_ID`: Bedrock model ID (default: amazon.nova-pro-v1:0)

**Memory**: 1024 MB (1 GB)  
**Timeout**: 300 seconds (5 minutes)

**Requirements**: 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5

---

### Profile Agent Handler (`profile-handler.ts`)

**Purpose**: Profile management specialist

**Responsibilities**:
- Classify profile operations (GET, UPDATE, LIST)
- Invoke appropriate profile service tools
- Ensure user data isolation
- Manage character, location, episode, and theory profiles

**Environment Variables**:
- `USER_PROFILES_TABLE`: DynamoDB table for user profiles
- `MODEL_ID`: Bedrock model ID (default: amazon.nova-pro-v1:0)

**Memory**: 1024 MB (1 GB)  
**Timeout**: 300 seconds (5 minutes)

**Requirements**: 1.3, 1.4, 4.1, 4.2, 4.3, 4.4, 4.5

---

## Event Flow

```
User Request
    │
    ▼
API Gateway
    │
    ▼
Gateway Lambda
    │
    ├─ Extract identity
    ├─ Enforce policy
    ├─ Load memory
    │
    ▼
Orchestrator Lambda
    │
    ├─ Classify query (keyword-based)
    │
    ├──► Query Agent Lambda
    │    ├─ Invoke semantic search
    │    ├─ Format citations
    │    └─ Return results
    │
    ├──► Theory Agent Lambda
    │    ├─ Extract theory
    │    ├─ Invoke Query Agent
    │    ├─ Analyze evidence
    │    └─ Update profiles
    │
    └──► Profile Agent Lambda
         ├─ Classify operation
         ├─ Invoke profile tools
         └─ Return results
```

## IAM Permissions

Each Lambda function has specific IAM permissions:

### Gateway Lambda
- Invoke: Orchestrator, Query, Theory, Profile Lambdas
- DynamoDB: Read/Write on UserProfiles, ConversationMemory tables

### Orchestrator Lambda
- Invoke: Query, Theory, Profile Lambdas
- Bedrock: InvokeModel (for classification if needed)

### Query Agent Lambda
- S3: Read from KnowledgeBase and ScriptData buckets
- Bedrock: InvokeModel, InvokeModelWithResponseStream

### Theory Agent Lambda
- Invoke: Query Lambda
- DynamoDB: Read/Write on UserProfiles table
- Bedrock: InvokeModel, InvokeModelWithResponseStream

### Profile Agent Lambda
- DynamoDB: Read/Write on UserProfiles table
- Bedrock: InvokeModel, InvokeModelWithResponseStream

## Cost Optimization

All Lambda functions are configured for cost efficiency:

- **Memory**: 512 MB for routing (Gateway, Orchestrator), 1024 MB for processing (Query, Theory, Profile)
- **Timeout**: 300 seconds (5 minutes) to handle complex queries
- **Log Retention**: 7 days to minimize CloudWatch costs
- **Bundling**: Minified with source maps, external AWS SDK modules

**Estimated Cost per Query**:
- Gateway: ~$0.0000008 (Lambda) + $0.000033 (Bedrock)
- Orchestrator: ~$0.0000008 (Lambda) + $0.000033 (Bedrock)
- Query Agent: ~$0.0000067 (Lambda) + $0.000093 (Bedrock)
- **Total**: ~$0.000134 per query

**Monthly Cost (100 queries)**: ~$0.013 + infrastructure (~$10-30) = **~$10-30/month**

## Deployment

Lambda functions are deployed via CDK in the `AgentStack`:

```bash
cd infrastructure
pnpm run deploy
```

Or deploy just the AgentStack:

```bash
cd infrastructure
cdk deploy CICADAAgentStack
```

## Testing

Test Lambda functions locally:

```bash
cd packages/backend
pnpm test
```

Test specific handler:

```bash
cd packages/backend
pnpm test handlers/agentcore/query-handler.test.ts
```

## Monitoring

Lambda functions are monitored via CloudWatch:

- **Logs**: `/aws/lambda/<function-name>`
- **Metrics**: Invocations, Duration, Errors, Throttles
- **Alarms**: Error rate, Duration threshold
- **X-Ray**: Distributed tracing for agent coordination

## Migration Notes

This implementation replaces Bedrock Agents (managed service) with AgentCore (framework/SDK):

**Before (Bedrock Agents)**:
- AWS controls tool selection (unreliable)
- Limited visibility into agent behavior
- Managed service costs

**After (AgentCore)**:
- Explicit tool invocation (deterministic)
- Full code visibility and control
- Lambda-based costs (more efficient)

**Key Improvements**:
- ✅ Deterministic tool invocation
- ✅ Explicit routing logic
- ✅ Full debugging capability
- ✅ Cost optimization
- ✅ Better error handling

## References

- Design Document: `.kiro/specs/agentcore-migration/design.md`
- Requirements: `.kiro/specs/agentcore-migration/requirements.md`
- Tasks: `.kiro/specs/agentcore-migration/tasks.md`
- Agent Implementations: `packages/backend/src/agents/`
