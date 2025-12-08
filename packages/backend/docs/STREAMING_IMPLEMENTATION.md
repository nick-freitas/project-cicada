# Streaming Implementation Guide

This document explains how streaming is implemented in CICADA's AgentCore architecture, including WebSocket integration, reconnection handling, and best practices.

## Overview

CICADA uses streaming responses to provide real-time feedback to users as agents process queries. Streaming is implemented using:

1. **AgentCore Streaming**: Agents stream responses via AWS Bedrock Agent Runtime
2. **WebSocket Delivery**: Chunks are delivered to the frontend via WebSocket
3. **Chunk Storage**: Chunks are stored in DynamoDB for reconnection support
4. **Request Tracking**: Request status is tracked for monitoring and recovery

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│                                                              │
│  - Receives streaming chunks via WebSocket                  │
│  - Displays chunks in real-time                             │
│  - Handles reconnection automatically                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (WSS)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Gateway WebSocket                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Message Processor (Lambda)                  │
│                                                              │
│  1. Invoke Orchestrator Agent                               │
│  2. Receive streaming chunks                                │
│  3. Store chunks in DynamoDB                                │
│  4. Forward chunks to WebSocket                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ InvokeAgentCommand
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestrator Agent (AgentCore)                  │
│                                                              │
│  - Streams response chunks                                  │
│  - Coordinates with specialized agents                      │
│  - Aggregates multi-agent responses                         │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Agent Configuration for Streaming

Agents are configured with streaming enabled in CDK:

```typescript
// infrastructure/lib/agent-stack.ts

const orchestratorAgent = new bedrock.CfnAgent(this, 'OrchestratorAgent', {
  agentName: 'CICADA-Orchestrator',
  foundationModel: 'amazon.nova-lite-v1:0',
  instruction: orchestratorInstructions,
  agentResourceRoleArn: agentRole.roleArn,
  // Streaming is enabled by default for agents
});
```

**Note**: Profile Agent has streaming disabled because profile operations are transactional:

```typescript
const profileAgent = new bedrock.CfnAgent(this, 'ProfileAgent', {
  agentName: 'CICADA-Profile',
  foundationModel: 'amazon.nova-lite-v1:0',
  instruction: profileInstructions,
  agentResourceRoleArn: agentRole.roleArn,
  // Profile operations are transactional, no streaming needed
});
```

### 2. Invoking Agent with Streaming

```typescript
// packages/backend/src/handlers/websocket/message-processor.ts

import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';

export async function processMessage(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    const { requestId, userId, query, sessionId, connectionId } = message;

    try {
      // Update request status to processing
      await updateRequestStatus(requestId, 'processing');

      // Create Bedrock Agent Runtime client
      const client = new BedrockAgentRuntimeClient({ 
        region: process.env.AWS_REGION || 'us-east-1' 
      });

      // Invoke Orchestrator Agent with streaming
      const command = new InvokeAgentCommand({
        agentId: process.env.ORCHESTRATOR_AGENT_ID!,
        agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
        sessionId: sessionId,
        inputText: query,
        enableTrace: true, // Enable for debugging
      });

      const response = await client.send(command);

      // Process streaming chunks
      await handleStreamingResponse(
        response,
        connectionId,
        requestId,
        userId
      );

    } catch (error) {
      logger.error('Error processing message', { error, requestId });
      await handleStreamingError(error, connectionId, requestId);
    }
  }
}
```

### 3. Handling Streaming Response

```typescript
async function handleStreamingResponse(
  response: InvokeAgentCommandOutput,
  connectionId: string,
  requestId: string,
  userId: string
): Promise<void> {
  try {
    let chunkIndex = 0;

    // Iterate through streaming chunks
    for await (const chunk of response.completion) {
      // Handle text chunks
      if (chunk.chunk?.bytes) {
        const text = new TextDecoder().decode(chunk.chunk.bytes);

        // Store chunk in DynamoDB for reconnection support
        await storeResponseChunk({
          requestId,
          chunkIndex,
          content: text,
          timestamp: new Date().toISOString(),
        });

        // Send chunk to WebSocket
        await sendToWebSocket(connectionId, {
          requestId,
          type: 'chunk',
          content: text,
          chunkIndex,
          timestamp: new Date().toISOString(),
        });

        chunkIndex++;
      }

      // Handle trace information (for debugging)
      if (chunk.trace) {
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
      totalChunks: chunkIndex,
      timestamp: new Date().toISOString(),
    });

    // Update request status
    await updateRequestStatus(requestId, 'complete');

    logger.info('Streaming completed', {
      requestId,
      totalChunks: chunkIndex,
    });

  } catch (error) {
    logger.error('Streaming error', { error, requestId });
    throw error;
  }
}
```

### 4. Storing Chunks for Reconnection

```typescript
// packages/backend/src/services/request-tracking-service.ts

export async function storeResponseChunk(params: {
  requestId: string;
  chunkIndex: number;
  content: string;
  timestamp: string;
}): Promise<void> {
  const { requestId, chunkIndex, content, timestamp } = params;

  await dynamoClient.send(
    new PutCommand({
      TableName: process.env.REQUEST_TRACKING_TABLE_NAME!,
      Item: {
        requestId,
        sortKey: `CHUNK#${chunkIndex.toString().padStart(6, '0')}`,
        content,
        timestamp,
        ttl: Math.floor(Date.now() / 1000) + 3600, // 1 hour TTL
      },
    })
  );
}

export async function getStoredChunks(
  requestId: string
): Promise<Array<{ chunkIndex: number; content: string }>> {
  const response = await dynamoClient.send(
    new QueryCommand({
      TableName: process.env.REQUEST_TRACKING_TABLE_NAME!,
      KeyConditionExpression: 'requestId = :requestId AND begins_with(sortKey, :prefix)',
      ExpressionAttributeValues: {
        ':requestId': requestId,
        ':prefix': 'CHUNK#',
      },
      ScanIndexForward: true, // Sort by chunkIndex ascending
    })
  );

  return (response.Items || []).map(item => ({
    chunkIndex: parseInt(item.sortKey.replace('CHUNK#', '')),
    content: item.content,
  }));
}
```

### 5. WebSocket Message Sending

```typescript
// packages/backend/src/handlers/websocket/handler.ts

export async function sendToWebSocket(
  connectionId: string,
  message: WebSocketMessage
): Promise<void> {
  const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
    endpoint: process.env.WEBSOCKET_API_ENDPOINT!,
  });

  try {
    await apiGatewayManagementApi.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: new TextEncoder().encode(JSON.stringify(message)),
      })
    );
  } catch (error) {
    if (error.statusCode === 410) {
      // Connection is gone, clean up
      logger.info('Connection gone', { connectionId });
      await cleanupConnection(connectionId);
    } else {
      logger.error('Error sending to WebSocket', { error, connectionId });
      throw error;
    }
  }
}
```

### 6. Reconnection Handling

```typescript
// packages/backend/src/handlers/websocket/handler.ts

export async function handleReconnection(
  connectionId: string,
  requestId: string
): Promise<void> {
  logger.info('Handling reconnection', { connectionId, requestId });

  // Get request status
  const request = await getRequestStatus(requestId);

  if (!request) {
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'error',
      error: 'Request not found',
    });
    return;
  }

  // Get all stored chunks
  const chunks = await getStoredChunks(requestId);

  // Resend all chunks
  for (const chunk of chunks) {
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'chunk',
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      isReplay: true,
    });
  }

  // Send appropriate status marker
  if (request.status === 'complete') {
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'complete',
      totalChunks: chunks.length,
      isReplay: true,
    });
  } else if (request.status === 'error') {
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'error',
      error: request.error || 'An error occurred',
      isReplay: true,
    });
  } else {
    // Still processing, chunks will continue to arrive
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'resuming',
      chunksReceived: chunks.length,
    });
  }
}
```

## Frontend Integration

### 1. WebSocket Hook

```typescript
// packages/frontend/src/hooks/useWebSocket.ts

export function useWebSocket() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const websocket = new WebSocket(WEBSOCKET_URL);

    websocket.onopen = () => {
      console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'chunk') {
        // Append chunk to current message
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.requestId === message.requestId) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + message.content,
              },
            ];
          }
          return prev;
        });
      } else if (message.type === 'complete') {
        // Mark message as complete
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.requestId === message.requestId) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                isComplete: true,
              },
            ];
          }
          return prev;
        });
      } else if (message.type === 'error') {
        // Handle error
        console.error('Streaming error:', message.error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt reconnection
      setTimeout(() => {
        setWs(null);
      }, 1000);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  return { ws, messages };
}
```

### 2. Sending Query with Streaming

```typescript
function sendQuery(query: string) {
  const requestId = generateRequestId();

  // Add placeholder message
  setMessages(prev => [
    ...prev,
    {
      requestId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      isComplete: false,
    },
  ]);

  // Send query via WebSocket
  ws?.send(JSON.stringify({
    action: 'sendMessage',
    requestId,
    query,
    sessionId: currentSessionId,
  }));
}
```

## Performance Considerations

### 1. Chunk Size

AgentCore automatically determines chunk size based on the model's output. Typical chunk sizes:
- Small chunks: 10-50 characters (faster perceived response)
- Large chunks: 100-500 characters (fewer WebSocket messages)

### 2. Chunk Storage TTL

Chunks are stored with a 1-hour TTL to support reconnection while minimizing storage costs:

```typescript
ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour
```

### 3. WebSocket Connection Management

- Connections are automatically cleaned up after 10 minutes of inactivity
- Reconnection is handled automatically by the frontend
- Stale connections are detected and removed

### 4. Concurrent Streaming

The system supports multiple concurrent streaming requests:
- Each request has a unique `requestId`
- Chunks are tagged with `requestId` for proper routing
- Frontend maintains separate message streams per request

## Error Handling

### 1. Streaming Interruption

```typescript
async function handleStreamingError(
  error: Error,
  connectionId: string,
  requestId: string
): Promise<void> {
  logger.error('Streaming error', { error, requestId });

  // Send error to user
  await sendToWebSocket(connectionId, {
    requestId,
    type: 'error',
    error: 'Stream interrupted. Please try again.',
    timestamp: new Date().toISOString(),
  });

  // Update request status
  await updateRequestStatus(requestId, 'error', error.message);
}
```

### 2. Connection Loss

```typescript
// Frontend automatically attempts reconnection
websocket.onclose = () => {
  console.log('Connection lost, reconnecting...');
  
  // Wait 1 second before reconnecting
  setTimeout(() => {
    reconnect();
  }, 1000);
};

function reconnect() {
  const newWs = new WebSocket(WEBSOCKET_URL);
  
  newWs.onopen = () => {
    // Request replay of incomplete messages
    incompleteMessages.forEach(msg => {
      newWs.send(JSON.stringify({
        action: 'reconnect',
        requestId: msg.requestId,
      }));
    });
  };
  
  setWs(newWs);
}
```

### 3. Timeout Handling

```typescript
// Set timeout for streaming
const STREAMING_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const timeoutId = setTimeout(() => {
  logger.warn('Streaming timeout', { requestId });
  
  // Send timeout error
  sendToWebSocket(connectionId, {
    requestId,
    type: 'error',
    error: 'Request timed out. Please try again.',
  });
  
  updateRequestStatus(requestId, 'error', 'Timeout');
}, STREAMING_TIMEOUT);

// Clear timeout when streaming completes
clearTimeout(timeoutId);
```

## Monitoring

### CloudWatch Metrics

```typescript
// Emit metrics for streaming
await cloudwatch.putMetricData({
  Namespace: 'CICADA/Streaming',
  MetricData: [
    {
      MetricName: 'StreamingDuration',
      Value: duration,
      Unit: 'Milliseconds',
      Dimensions: [
        { Name: 'AgentId', Value: agentId },
      ],
    },
    {
      MetricName: 'ChunkCount',
      Value: chunkCount,
      Unit: 'Count',
      Dimensions: [
        { Name: 'AgentId', Value: agentId },
      ],
    },
    {
      MetricName: 'TimeToFirstChunk',
      Value: timeToFirstChunk,
      Unit: 'Milliseconds',
      Dimensions: [
        { Name: 'AgentId', Value: agentId },
      ],
    },
  ],
});
```

### Logging

```typescript
// Log streaming events
logger.info('Streaming started', {
  requestId,
  agentId,
  sessionId,
  queryLength: query.length,
});

logger.info('Chunk received', {
  requestId,
  chunkIndex,
  chunkSize: text.length,
});

logger.info('Streaming completed', {
  requestId,
  totalChunks: chunkIndex,
  duration: Date.now() - startTime,
});
```

## Best Practices

### 1. Always Store Chunks

```typescript
// ✅ Good - Store chunks for reconnection
await storeResponseChunk({
  requestId,
  chunkIndex,
  content: text,
  timestamp: new Date().toISOString(),
});

// ❌ Bad - No storage, reconnection won't work
await sendToWebSocket(connectionId, { content: text });
```

### 2. Handle All Chunk Types

```typescript
// ✅ Good - Handle all chunk types
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    // Handle text chunk
  }
  if (chunk.trace) {
    // Handle trace
  }
}

// ❌ Bad - Only handle text chunks
for await (const chunk of response.completion) {
  const text = new TextDecoder().decode(chunk.chunk.bytes);
}
```

### 3. Send Completion Marker

```typescript
// ✅ Good - Send completion marker
await sendToWebSocket(connectionId, {
  requestId,
  type: 'complete',
  totalChunks: chunkIndex,
});

// ❌ Bad - No completion marker
// Frontend won't know when streaming is done
```

### 4. Implement Timeout

```typescript
// ✅ Good - Timeout protection
const timeoutId = setTimeout(() => {
  handleTimeout(requestId);
}, STREAMING_TIMEOUT);

// ❌ Bad - No timeout
// Streaming could hang indefinitely
```

## Testing

### Unit Test

```typescript
describe('Streaming', () => {
  it('should handle streaming chunks', async () => {
    const mockResponse = {
      completion: (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('chunk1') } };
        yield { chunk: { bytes: new TextEncoder().encode('chunk2') } };
      })(),
    };

    const chunks: string[] = [];
    for await (const chunk of mockResponse.completion) {
      if (chunk.chunk?.bytes) {
        chunks.push(new TextDecoder().decode(chunk.chunk.bytes));
      }
    }

    expect(chunks).toEqual(['chunk1', 'chunk2']);
  });
});
```

### Integration Test

```typescript
describe('Streaming Integration', () => {
  it('should stream response to WebSocket', async () => {
    const requestId = generateRequestId();
    const connectionId = 'test-connection';

    const receivedChunks: string[] = [];

    // Mock WebSocket send
    jest.spyOn(apiGateway, 'send').mockImplementation(async (command) => {
      const message = JSON.parse(
        new TextDecoder().decode(command.input.Data)
      );
      if (message.type === 'chunk') {
        receivedChunks.push(message.content);
      }
    });

    await processMessage({
      requestId,
      connectionId,
      query: 'test query',
    });

    expect(receivedChunks.length).toBeGreaterThan(0);
  });
});
```

## References

- [AgentCore Architecture](./AGENTCORE_ARCHITECTURE.md)
- [Agent Invocation Examples](./AGENT_INVOCATION_EXAMPLES.md)
- [WebSocket Handler](../src/handlers/websocket/handler.ts)
- [Message Processor](../src/handlers/websocket/message-processor.ts)
- [Request Tracking Service](../src/services/request-tracking-service.ts)
