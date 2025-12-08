# Agent Invocation Examples

This document provides practical examples of agent invocation patterns in CICADA's AgentCore implementation.

## Table of Contents

1. [Basic Agent Invocation](#basic-agent-invocation)
2. [Agent-to-Agent Invocation](#agent-to-agent-invocation)
3. [Streaming Responses](#streaming-responses)
4. [Error Handling](#error-handling)
5. [Multi-Agent Coordination](#multi-agent-coordination)
6. [Testing Agent Invocations](#testing-agent-invocations)

## Basic Agent Invocation

### Example 1: Invoking Orchestrator from Lambda

```typescript
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';

export async function invokeOrchestrator(
  query: string,
  userId: string,
  sessionId: string
): Promise<string> {
  const client = new BedrockAgentRuntimeClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
  });

  const command = new InvokeAgentCommand({
    agentId: process.env.ORCHESTRATOR_AGENT_ID!,
    agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
    sessionId: sessionId,
    inputText: query,
    enableTrace: true,
  });

  const response = await client.send(command);

  // Collect full response
  let fullResponse = '';
  for await (const chunk of response.completion) {
    if (chunk.chunk?.bytes) {
      fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
    }
  }

  return fullResponse;
}
```

### Example 2: Invoking with Session Context

```typescript
export async function invokeWithContext(
  query: string,
  userId: string,
  sessionId: string,
  episodeContext?: string[]
): Promise<AgentResponse> {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  // Build input with context
  const input = {
    query,
    userId,
    episodeContext: episodeContext || [],
    timestamp: new Date().toISOString(),
  };

  const command = new InvokeAgentCommand({
    agentId: process.env.ORCHESTRATOR_AGENT_ID!,
    agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
    sessionId: sessionId,
    inputText: JSON.stringify(input),
    enableTrace: true,
  });

  const response = await client.send(command);

  let fullResponse = '';
  for await (const chunk of response.completion) {
    if (chunk.chunk?.bytes) {
      fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
    }
  }

  return JSON.parse(fullResponse);
}
```

## Agent-to-Agent Invocation

### Example 3: Orchestrator Invoking Query Agent

**Tool Definition** (in agent-stack.ts):

```typescript
const queryAgentTool = {
  toolSpec: {
    name: 'invoke_query_agent',
    description: 'Invoke the Query Agent to search script data and retrieve citations',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute',
          },
          characterFocus: {
            type: 'string',
            description: 'Optional character name to focus the search on',
          },
          episodeContext: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of episode IDs to search within',
          },
        },
        required: ['query'],
      },
    },
  },
};
```

**Tool Handler** (in orchestrator-agent-tools.ts):

```typescript
export async function invokeQueryAgent(
  input: QueryAgentInput
): Promise<QueryAgentOutput> {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  logger.info('Invoking Query Agent', {
    query: input.query,
    characterFocus: input.characterFocus,
    episodeContext: input.episodeContext,
  });

  const command = new InvokeAgentCommand({
    agentId: process.env.QUERY_AGENT_ID!,
    agentAliasId: process.env.QUERY_AGENT_ALIAS_ID!,
    sessionId: input.sessionId,
    inputText: JSON.stringify({
      query: input.query,
      characterFocus: input.characterFocus,
      episodeContext: input.episodeContext,
      userId: input.userId,
    }),
  });

  const response = await client.send(command);

  let fullResponse = '';
  for await (const chunk of response.completion) {
    if (chunk.chunk?.bytes) {
      fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
    }
  }

  const result = JSON.parse(fullResponse);

  logger.info('Query Agent response received', {
    citationCount: result.citations?.length || 0,
    hasDirectEvidence: result.hasDirectEvidence,
  });

  return result;
}
```

### Example 4: Theory Agent Invoking Query Agent

**Tool Handler** (in theory-agent-tools.ts):

```typescript
export async function gatherEvidence(
  input: EvidenceGatheringInput
): Promise<EvidenceGatheringOutput> {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  logger.info('Theory Agent gathering evidence', {
    theoryDescription: input.theoryDescription,
  });

  // Invoke Query Agent multiple times for different evidence types
  const supportingEvidenceQuery = `Find evidence supporting: ${input.theoryDescription}`;
  const contradictingEvidenceQuery = `Find evidence contradicting: ${input.theoryDescription}`;

  // Gather supporting evidence
  const supportingCommand = new InvokeAgentCommand({
    agentId: process.env.QUERY_AGENT_ID!,
    agentAliasId: process.env.QUERY_AGENT_ALIAS_ID!,
    sessionId: input.sessionId,
    inputText: JSON.stringify({
      query: supportingEvidenceQuery,
      userId: input.userId,
      episodeContext: input.episodeContext,
    }),
  });

  const supportingResponse = await client.send(supportingCommand);
  let supportingEvidence = '';
  for await (const chunk of supportingResponse.completion) {
    if (chunk.chunk?.bytes) {
      supportingEvidence += new TextDecoder().decode(chunk.chunk.bytes);
    }
  }

  // Gather contradicting evidence
  const contradictingCommand = new InvokeAgentCommand({
    agentId: process.env.QUERY_AGENT_ID!,
    agentAliasId: process.env.QUERY_AGENT_ALIAS_ID!,
    sessionId: input.sessionId,
    inputText: JSON.stringify({
      query: contradictingEvidenceQuery,
      userId: input.userId,
      episodeContext: input.episodeContext,
    }),
  });

  const contradictingResponse = await client.send(contradictingCommand);
  let contradictingEvidence = '';
  for await (const chunk of contradictingResponse.completion) {
    if (chunk.chunk?.bytes) {
      contradictingEvidence += new TextDecoder().decode(chunk.chunk.bytes);
    }
  }

  return {
    supportingEvidence: JSON.parse(supportingEvidence),
    contradictingEvidence: JSON.parse(contradictingEvidence),
  };
}
```

## Streaming Responses

### Example 5: Streaming to WebSocket

```typescript
export async function streamToWebSocket(
  agentId: string,
  agentAliasId: string,
  sessionId: string,
  query: string,
  connectionId: string,
  requestId: string
): Promise<void> {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId,
    sessionId,
    inputText: query,
    enableTrace: true,
  });

  try {
    const response = await client.send(command);

    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        const text = new TextDecoder().decode(chunk.chunk.bytes);

        // Store chunk for reconnection support
        await storeResponseChunk(requestId, text);

        // Send to WebSocket
        await sendToWebSocket(connectionId, {
          requestId,
          type: 'chunk',
          content: text,
          timestamp: new Date().toISOString(),
        });
      }

      if (chunk.trace) {
        // Log trace information for debugging
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
      timestamp: new Date().toISOString(),
    });

    await updateRequestStatus(requestId, 'complete');

  } catch (error) {
    logger.error('Streaming error', { error, requestId });

    await sendToWebSocket(connectionId, {
      requestId,
      type: 'error',
      error: 'Stream interrupted. Please try again.',
      timestamp: new Date().toISOString(),
    });

    await updateRequestStatus(requestId, 'error');
  }
}
```

### Example 6: Collecting Streaming Response

```typescript
export async function collectStreamingResponse(
  agentId: string,
  agentAliasId: string,
  sessionId: string,
  query: string
): Promise<string> {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId,
    sessionId,
    inputText: query,
  });

  const response = await client.send(command);

  const chunks: string[] = [];

  for await (const chunk of response.completion) {
    if (chunk.chunk?.bytes) {
      const text = new TextDecoder().decode(chunk.chunk.bytes);
      chunks.push(text);
    }
  }

  return chunks.join('');
}
```

## Error Handling

### Example 7: Retry with Exponential Backoff

```typescript
import { AgentInvocationError } from '../utils/errors';

export async function invokeAgentWithRetry(
  params: {
    agentId: string;
    agentAliasId: string;
    sessionId: string;
    inputText: string;
    maxRetries?: number;
    retryDelay?: number;
  }
): Promise<string> {
  const { maxRetries = 3, retryDelay = 1000, ...invokeParams } = params;
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = new InvokeAgentCommand(invokeParams);
      const response = await client.send(command);

      let fullResponse = '';
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
        }
      }

      return fullResponse;

    } catch (error) {
      lastError = error as Error;

      logger.warn('Agent invocation attempt failed', {
        attempt,
        maxRetries,
        error: error.message,
        agentId: params.agentId,
      });

      // Check if error is retryable
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw new AgentInvocationError(
          `Failed to invoke agent after ${attempt} attempts`,
          params.agentId,
          false,
          error as Error
        );
      }

      // Exponential backoff
      const delay = retryDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw new AgentInvocationError(
    `Failed to invoke agent after ${maxRetries} attempts`,
    params.agentId,
    false,
    lastError
  );
}

function isRetryableError(error: any): boolean {
  // Retry on throttling, timeout, and temporary errors
  const retryableErrors = [
    'ThrottlingException',
    'ServiceUnavailableException',
    'InternalServerException',
    'TimeoutError',
  ];

  return retryableErrors.some(errType => 
    error.name === errType || error.code === errType
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Example 8: Graceful Error Handling

```typescript
export async function invokeAgentSafely(
  agentId: string,
  agentAliasId: string,
  sessionId: string,
  query: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const result = await invokeAgentWithRetry({
      agentId,
      agentAliasId,
      sessionId,
      inputText: query,
    });

    return {
      success: true,
      data: result,
    };

  } catch (error) {
    if (error instanceof AgentInvocationError) {
      logger.error('Agent invocation failed', {
        agentName: error.agentName,
        retryable: error.retryable,
        error: error.originalError,
      });

      return {
        success: false,
        error: 'Unable to process your request. Please try again later.',
      };
    }

    logger.error('Unexpected error', { error });

    return {
      success: false,
      error: 'An unexpected error occurred.',
    };
  }
}
```

## Multi-Agent Coordination

### Example 9: Sequential Agent Invocation

```typescript
export async function coordinateSequentialAgents(
  query: string,
  userId: string,
  sessionId: string
): Promise<CoordinatedResponse> {
  // Step 1: Invoke Query Agent for evidence
  const queryResult = await invokeQueryAgent({
    query,
    userId,
    sessionId,
  });

  // Step 2: Invoke Theory Agent with evidence
  const theoryResult = await invokeTheoryAgent({
    theoryDescription: query,
    evidence: queryResult.citations,
    userId,
    sessionId,
  });

  // Step 3: Invoke Profile Agent to update profiles
  const profileResult = await invokeProfileAgent({
    conversationContext: JSON.stringify({
      query,
      queryResult,
      theoryResult,
    }),
    userId,
    sessionId,
  });

  return {
    content: theoryResult.analysis,
    citations: queryResult.citations,
    profileUpdates: profileResult.updatedProfiles,
  };
}
```

### Example 10: Parallel Agent Invocation

```typescript
export async function coordinateParallelAgents(
  query: string,
  userId: string,
  sessionId: string
): Promise<CoordinatedResponse> {
  // Invoke multiple agents in parallel
  const [queryResult, profileResult] = await Promise.all([
    invokeQueryAgent({
      query,
      userId,
      sessionId,
    }),
    invokeProfileAgent({
      conversationContext: query,
      userId,
      sessionId,
      extractionMode: 'auto',
    }),
  ]);

  // Combine results
  return {
    content: queryResult.content,
    citations: queryResult.citations,
    profileUpdates: profileResult.updatedProfiles,
  };
}
```

## Testing Agent Invocations

### Example 11: Unit Test with Mocked SDK

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';

describe('Agent Invocation', () => {
  const agentMock = mockClient(BedrockAgentRuntimeClient);

  beforeEach(() => {
    agentMock.reset();
  });

  it('should invoke agent and return response', async () => {
    // Mock streaming response
    const mockResponse = {
      completion: (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode('Test response'),
          },
        };
      })(),
    };

    agentMock.on(InvokeAgentCommand).resolves(mockResponse);

    const result = await invokeOrchestrator(
      'test query',
      'test-user',
      'test-session'
    );

    expect(result).toBe('Test response');
    expect(agentMock.calls()).toHaveLength(1);
  });

  it('should handle errors gracefully', async () => {
    agentMock.on(InvokeAgentCommand).rejects(
      new Error('Agent not found')
    );

    const result = await invokeAgentSafely(
      'test-agent-id',
      'test-alias-id',
      'test-session',
      'test query'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### Example 12: Integration Test with Real Agents

```typescript
describe('Agent Integration', () => {
  // Skip if agents not deployed
  const agentId = process.env.ORCHESTRATOR_AGENT_ID;
  const agentAliasId = process.env.ORCHESTRATOR_AGENT_ALIAS_ID;

  if (!agentId || !agentAliasId) {
    console.log('Skipping integration tests - agents not deployed');
    return;
  }

  it('should invoke real agent and get response', async () => {
    const result = await invokeOrchestrator(
      'What is Higurashi about?',
      'test-user',
      `test-session-${Date.now()}`
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout

  it('should handle agent-to-agent coordination', async () => {
    const result = await coordinateSequentialAgents(
      'Analyze the theory that Takano is behind the incidents',
      'test-user',
      `test-session-${Date.now()}`
    );

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('citations');
    expect(result.citations).toBeInstanceOf(Array);
  }, 60000); // 60 second timeout
});
```

## Best Practices

### 1. Always Use Environment Variables

```typescript
// ✅ Good
const agentId = process.env.ORCHESTRATOR_AGENT_ID!;

// ❌ Bad
const agentId = 'hardcoded-agent-id';
```

### 2. Enable Tracing for Debugging

```typescript
const command = new InvokeAgentCommand({
  agentId,
  agentAliasId,
  sessionId,
  inputText: query,
  enableTrace: true, // ✅ Enable for debugging
});
```

### 3. Handle Streaming Properly

```typescript
// ✅ Good - Process all chunks
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    const text = new TextDecoder().decode(chunk.chunk.bytes);
    // Process chunk
  }
}

// ❌ Bad - Missing await
for (const chunk of response.completion) {
  // This won't work!
}
```

### 4. Implement Retry Logic

```typescript
// ✅ Good - Retry with backoff
const result = await invokeAgentWithRetry({
  agentId,
  agentAliasId,
  sessionId,
  inputText: query,
  maxRetries: 3,
});

// ❌ Bad - No retry
const result = await invokeAgent(agentId, query);
```

### 5. Log Agent Interactions

```typescript
// ✅ Good - Structured logging
logger.info('Invoking agent', {
  agentId,
  sessionId,
  queryLength: query.length,
});

// ❌ Bad - No logging
await invokeAgent(agentId, query);
```

## References

- [AgentCore Architecture](./AGENTCORE_ARCHITECTURE.md)
- [Error Handling Utilities](../src/utils/errors.ts)
- [Agent Invocation Utilities](../src/utils/agent-invocation.ts)
- [AWS SDK Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent-runtime/)
