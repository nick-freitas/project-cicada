# AgentCore Architecture

## Overview

CICADA uses AWS AgentCore to implement a multi-agent architecture with specialized agents coordinated by a central Orchestrator. This document provides a comprehensive overview of the agent architecture, communication patterns, and implementation details.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React)                            │
│                   WebSocket Connection                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WSS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Gateway WebSocket                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  WebSocket Handler (Lambda)                      │
│              - Manages connections                               │
│              - Routes to SQS                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SQS Message Queue                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Message Processor (Lambda)                      │
│              - Invokes Orchestrator Agent                        │
│              - Handles streaming                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ AgentCore Invocation
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT (AgentCore)                      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Agent Definition                                      │     │
│  │  - Query intent analysis                               │     │
│  │  - Agent routing logic                                 │     │
│  │  - Response aggregation                                │     │
│  │  - Conversation context management                     │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Foundation Model: Nova Lite                                     │
│  Streaming: Enabled                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Agent-to-Agent Invocation
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ QUERY AGENT  │    │ THEORY AGENT │    │PROFILE AGENT │
│ (AgentCore)  │    │ (AgentCore)  │    │ (AgentCore)  │
│              │    │              │    │              │
│ - Semantic   │    │ - Theory     │    │ - Info       │
│   search     │    │   analysis   │    │   extraction │
│ - Citations  │    │ - Evidence   │    │ - Profile    │
│ - Nuances    │    │   gathering  │    │   updates    │
│              │    │ - Refinement │    │ - Retrieval  │
│              │    │              │    │              │
│ Nova Lite    │    │ Nova Lite    │    │ Nova Lite    │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supporting Services                           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Knowledge    │  │ Profile      │  │ Memory       │          │
│  │ Base         │  │ Service      │  │ Service      │          │
│  │ (S3+Bedrock) │  │ (DynamoDB)   │  │ (DynamoDB)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Roles and Responsibilities

### Orchestrator Agent

**Purpose**: Central coordinator that analyzes queries and routes to specialized agents

**Key Responsibilities**:
- Analyze user query intent
- Determine which specialized agents to invoke
- Coordinate multi-agent workflows
- Aggregate responses from multiple agents
- Maintain conversation context
- Enforce episode boundaries

**Configuration**:
- Model: Amazon Nova Lite (`amazon.nova-lite-v1:0`)
- Streaming: Enabled
- Session Timeout: 10 minutes

**Tools**:
- `invoke_query_agent`: Invoke Query Agent for script searches
- `invoke_theory_agent`: Invoke Theory Agent for theory analysis
- `invoke_profile_agent`: Invoke Profile Agent for knowledge extraction

### Query Agent

**Purpose**: Semantic search over script data with citation and nuance analysis

**Key Responsibilities**:
- Perform semantic search using Knowledge Base
- Format citations with complete metadata
- Analyze linguistic nuances (Japanese vs English)
- Enforce episode boundary constraints
- Focus on character-specific information

**Configuration**:
- Model: Amazon Nova Lite
- Streaming: Enabled
- Session Timeout: 10 minutes

**Tools**:
- `search_knowledge_base`: Search script data
- `format_citation`: Format search results as citations
- `analyze_nuance`: Compare Japanese/English text

### Theory Agent

**Purpose**: Theory analysis, evidence gathering, and refinement

**Key Responsibilities**:
- Analyze user theories about the narrative
- Gather supporting and contradicting evidence
- Identify profile corrections
- Generate theory refinement suggestions
- Maintain evidence-based reasoning

**Configuration**:
- Model: Amazon Nova Lite
- Streaming: Enabled
- Session Timeout: 10 minutes

**Tools**:
- `invoke_query_agent`: Gather evidence via Query Agent
- `access_profile`: Retrieve profile data
- `update_profile`: Correct profile information

### Profile Agent

**Purpose**: Knowledge extraction and profile management

**Key Responsibilities**:
- Extract character, location, episode, and theory information
- Create and update user-specific profiles
- Maintain profile consistency and accuracy
- Ensure user isolation (profiles never shared)

**Configuration**:
- Model: Amazon Nova Lite
- Streaming: Disabled (transactional operations)
- Session Timeout: 10 minutes

**Tools**:
- `extract_entity`: Extract entity information
- `get_profile`: Retrieve existing profile
- `create_profile`: Create new profile
- `update_profile`: Update profile data

## Communication Flow

### 1. User Query Flow

```
User Query
    ↓
WebSocket Handler
    ↓
SQS Queue
    ↓
Message Processor
    ↓
Orchestrator Agent (analyzes intent)
    ↓
[Specialized Agents invoked based on intent]
    ↓
Orchestrator Agent (aggregates responses)
    ↓
Streaming chunks to WebSocket
    ↓
User receives response
```

### 2. Multi-Agent Coordination Example

**Query**: "What does Rena say about the dam war?"

```
1. Message Processor → Orchestrator Agent
   Input: "What does Rena say about the dam war?"

2. Orchestrator analyzes intent
   - Detects: Script search query
   - Detects: Character focus (Rena)
   - Decision: Invoke Query Agent

3. Orchestrator → Query Agent
   Input: {
     query: "What does Rena say about the dam war?",
     characterFocus: "Rena Ryuugu"
   }

4. Query Agent processes
   - Searches Knowledge Base
   - Filters for Rena's dialogue
   - Formats citations
   - Returns results

5. Query Agent → Orchestrator
   Output: {
     content: "Rena discusses...",
     citations: [...]
   }

6. Orchestrator → Message Processor
   Streams aggregated response

7. Message Processor → WebSocket → User
   User sees streaming response with citations
```

### 3. Theory Analysis Flow

**Query**: "Analyze the theory that Takano is behind the incidents"

```
1. Orchestrator receives query
   - Detects: Theory analysis request
   - Decision: Invoke Theory Agent

2. Orchestrator → Theory Agent
   Input: {
     theoryDescription: "Takano is behind the incidents"
   }

3. Theory Agent processes
   - Invokes Query Agent for evidence
   - Accesses Profile Agent for context
   - Analyzes evidence
   - Generates refinements

4. Theory Agent → Query Agent (multiple times)
   - "Find evidence about Takano's actions"
   - "Find evidence about incident timing"
   - "Find contradicting evidence"

5. Theory Agent aggregates evidence
   - Supporting evidence: [...]
   - Contradicting evidence: [...]
   - Refinement suggestions: [...]

6. Theory Agent → Orchestrator
   Returns complete analysis

7. Orchestrator streams to user
```

## Agent Invocation Patterns

### Pattern 1: Lambda to Agent (Message Processor → Orchestrator)

```typescript
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

const command = new InvokeAgentCommand({
  agentId: process.env.ORCHESTRATOR_AGENT_ID!,
  agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
  sessionId: sessionId,
  inputText: userQuery,
  enableTrace: true,
});

const response = await client.send(command);

// Process streaming response
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    const text = new TextDecoder().decode(chunk.chunk.bytes);
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'chunk',
      content: text,
    });
  }
}
```

### Pattern 2: Agent to Agent (Orchestrator → Query Agent)

Defined as a tool in the Orchestrator Agent:

```typescript
// In agent-stack.ts - Orchestrator Agent tools
const queryAgentTool = {
  name: 'invoke_query_agent',
  description: 'Invoke the Query Agent to search script data and retrieve citations',
  parameters: {
    query: 'string - The search query',
    characterFocus: 'string (optional) - Character to focus on',
    episodeContext: 'array (optional) - Episode IDs to search within'
  }
};
```

Tool handler implementation:

```typescript
// In orchestrator-agent-tools.ts
export async function invokeQueryAgent(input: QueryAgentInput): Promise<QueryAgentOutput> {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
  
  const command = new InvokeAgentCommand({
    agentId: process.env.QUERY_AGENT_ID!,
    agentAliasId: process.env.QUERY_AGENT_ALIAS_ID!,
    sessionId: input.sessionId,
    inputText: JSON.stringify({
      query: input.query,
      characterFocus: input.characterFocus,
      episodeContext: input.episodeContext,
    }),
  });

  const response = await client.send(command);
  
  // Collect full response
  let fullResponse = '';
  for await (const chunk of response.completion) {
    if (chunk.chunk?.bytes) {
      fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
    }
  }

  return JSON.parse(fullResponse);
}
```

### Pattern 3: Error Handling with Retry

```typescript
import { invokeAgentWithRetry } from '../utils/agent-invocation';

try {
  const result = await invokeAgentWithRetry({
    agentId: process.env.ORCHESTRATOR_AGENT_ID!,
    agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
    sessionId: sessionId,
    inputText: userQuery,
    maxRetries: 3,
    retryDelay: 1000,
  });
  
  // Process result
} catch (error) {
  if (error instanceof AgentInvocationError) {
    logger.error('Agent invocation failed', {
      agentName: error.agentName,
      retryable: error.retryable,
      error: error.originalError,
    });
    
    // Send error to user
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'error',
      error: 'Unable to process your request. Please try again.',
    });
  }
}
```

## Streaming Implementation

### Streaming Response Handling

```typescript
export async function handleStreamingResponse(
  response: InvokeAgentCommandOutput,
  connectionId: string,
  requestId: string
): Promise<void> {
  try {
    for await (const chunk of response.completion) {
      // Handle different chunk types
      if (chunk.chunk?.bytes) {
        // Text chunk
        const text = new TextDecoder().decode(chunk.chunk.bytes);
        
        // Store chunk for reconnection
        await storeResponseChunk(requestId, text);
        
        // Send to WebSocket
        await sendToWebSocket(connectionId, {
          requestId,
          type: 'chunk',
          content: text,
        });
      }
      
      if (chunk.trace) {
        // Trace information (for debugging)
        logger.debug('Agent trace', {
          requestId,
          trace: chunk.trace,
        });
      }
    }
    
    // Send completion marker
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'complete',
    });
    
    await updateRequestStatus(requestId, 'complete');
    
  } catch (error) {
    logger.error('Streaming error', { error, requestId });
    
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'error',
      error: 'Stream interrupted. Please try again.',
    });
    
    await updateRequestStatus(requestId, 'error');
  }
}
```

### Reconnection Support

```typescript
// When user reconnects, resume from last chunk
export async function resumeStreaming(
  requestId: string,
  connectionId: string
): Promise<void> {
  const request = await getRequestStatus(requestId);
  
  if (request.status === 'complete') {
    // Send all stored chunks
    const chunks = await getStoredChunks(requestId);
    
    for (const chunk of chunks) {
      await sendToWebSocket(connectionId, {
        requestId,
        type: 'chunk',
        content: chunk.content,
      });
    }
    
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'complete',
    });
  } else if (request.status === 'processing') {
    // Send chunks received so far
    const chunks = await getStoredChunks(requestId);
    
    for (const chunk of chunks) {
      await sendToWebSocket(connectionId, {
        requestId,
        type: 'chunk',
        content: chunk.content,
      });
    }
    
    // Continue streaming (handled by message processor)
  }
}
```

## Environment Variables

Required environment variables for agent invocation:

```bash
# Orchestrator Agent
ORCHESTRATOR_AGENT_ID=<agent-id>
ORCHESTRATOR_AGENT_ALIAS_ID=<alias-id>

# Query Agent
QUERY_AGENT_ID=<agent-id>
QUERY_AGENT_ALIAS_ID=<alias-id>

# Theory Agent
THEORY_AGENT_ID=<agent-id>
THEORY_AGENT_ALIAS_ID=<alias-id>

# Profile Agent
PROFILE_AGENT_ID=<agent-id>
PROFILE_AGENT_ALIAS_ID=<alias-id>

# AWS Region
AWS_REGION=us-east-1
```

These are automatically populated from CDK stack outputs during deployment.

## Cost Optimization

### Token Usage Optimization

1. **Concise Agent Instructions**: Agent instructions are optimized to be clear but minimal
2. **Context Compaction**: Conversation context is compacted to reduce token usage
3. **Targeted Agent Invocation**: Only invoke agents that are needed for the query
4. **Efficient Tool Definitions**: Tool schemas are minimal but complete

### Model Selection

All agents use **Amazon Nova Lite** for optimal cost/performance:
- Input: $0.06 per 1M tokens
- Output: $0.24 per 1M tokens

Estimated cost per 100 queries: ~$0.03

### Monitoring Costs

CloudWatch metrics track:
- Token usage per agent
- Agent invocation count
- Cost per query (estimated)

See [Monitoring and Observability](./monitoring-and-observability.md) for details.

## Security

### IAM Permissions

Agents have minimal required permissions:
- Bedrock model invocation (Nova Lite, Nova Micro, Titan Embeddings)
- DynamoDB read/write (user-scoped)
- S3 read (Knowledge Base)
- Agent-to-agent invocation

### Data Isolation

- All profile and memory access is filtered by `userId`
- Sessions are isolated by `sessionId`
- Agents cannot access data from other users
- All data is encrypted at rest and in transit

### Input Validation

All agent inputs are validated:
- Required fields checked
- Input sanitized
- Length limits enforced
- Episode context validated

## Testing

### Unit Tests

Test agent logic with mocked SDK calls:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

describe('Orchestrator Agent', () => {
  const agentMock = mockClient(BedrockAgentRuntimeClient);

  beforeEach(() => {
    agentMock.reset();
  });

  it('should invoke Query Agent for script queries', async () => {
    agentMock.on(InvokeAgentCommand).resolves({
      completion: mockStreamingResponse('Query result...'),
    });

    const result = await invokeOrchestratorAgent({
      query: 'What does Rena say about...',
      userId: 'test-user',
      sessionId: 'test-session',
    });

    expect(result.agentsInvoked).toContain('query');
  });
});
```

### Integration Tests

Test with deployed agents:

```typescript
describe('Agent Integration', () => {
  it('should coordinate multiple agents', async () => {
    const orchestratorId = process.env.ORCHESTRATOR_AGENT_ID;
    
    const result = await invokeAgent(orchestratorId, {
      query: 'Analyze the theory that...',
      userId: 'test-user',
      sessionId: 'test-session',
    });

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('citations');
  });
});
```

### Property-Based Tests

Verify correctness properties:

```typescript
describe('Property: Agent Invocation Consistency', () => {
  it('should produce consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10 }),
        async (query) => {
          const result = await invokeOrchestratorAgent({ 
            query, 
            userId: 'test' 
          });
          
          // Property: All responses should have required fields
          expect(result).toHaveProperty('content');
          expect(result).toHaveProperty('agentsInvoked');
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

## Troubleshooting

### Agent Not Found

**Symptom**: `ResourceNotFoundException: Agent not found`

**Solutions**:
1. Verify agent is deployed: `aws bedrock-agent list-agents`
2. Check environment variables are set correctly
3. Ensure using correct agent ID and alias ID
4. Verify agent is in the same region as Lambda

### Permission Denied

**Symptom**: `AccessDeniedException: User is not authorized`

**Solutions**:
1. Check Lambda execution role has `bedrock:InvokeAgent` permission
2. Verify agent resource role has necessary permissions
3. Check cross-stack references are resolving correctly
4. Ensure agent alias is created and active

### Streaming Timeout

**Symptom**: Stream stops mid-response

**Solutions**:
1. Check Lambda timeout (should be 5+ minutes)
2. Verify WebSocket connection is stable
3. Check CloudWatch logs for errors
4. Implement reconnection handling in frontend

### High Latency

**Symptom**: Slow response times

**Solutions**:
1. Check agent instructions aren't too long
2. Verify context isn't too large
3. Monitor token usage in CloudWatch
4. Consider using Nova Micro for simpler queries
5. Optimize tool definitions

## References

- [AgentCore Setup Guide](./agentcore-setup.md)
- [Monitoring and Observability](./monitoring-and-observability.md)
- [Performance Testing Guide](./performance-testing-guide.md)
- [Agent Stack README](../../infrastructure/lib/README-agent-stack.md)
- [Design Document](../../.kiro/specs/agentcore-implementation/design.md)
- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
