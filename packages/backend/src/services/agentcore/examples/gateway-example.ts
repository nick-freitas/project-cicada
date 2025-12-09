/**
 * Example usage of AgentCore Gateway
 * 
 * This demonstrates how to use the Gateway to handle agent requests
 * with identity, policy, and memory management.
 */

import { gateway, GatewayRequest } from '../gateway';

/**
 * Example 1: Basic request handling
 */
async function basicRequestExample() {
  console.log('\n=== Example 1: Basic Request ===\n');

  const request: GatewayRequest = {
    query: 'Tell me about Rena Ryuugu',
    userId: 'user-123',
    sessionId: 'session-456',
    connectionId: 'conn-789',
    requestId: 'req-001',
  };

  const response = await gateway.handleRequest(request);

  console.log('Request successful:', response.success);
  console.log('Response:', response.content.substring(0, 200) + '...');
  console.log('Duration:', response.metadata?.duration, 'ms');
}

/**
 * Example 2: Request with streaming
 */
async function streamingRequestExample() {
  console.log('\n=== Example 2: Streaming Request ===\n');

  const request: GatewayRequest = {
    query: 'What happens in Onikakushi?',
    userId: 'user-123',
    sessionId: 'session-456',
    connectionId: 'conn-789',
    requestId: 'req-002',
  };

  let chunkCount = 0;
  const streamCallback = async (chunk: string) => {
    chunkCount++;
    console.log(`Chunk ${chunkCount}:`, chunk.substring(0, 50) + '...');
  };

  const response = await gateway.handleRequest(request, streamCallback);

  console.log('\nStreaming complete');
  console.log('Total chunks:', chunkCount);
  console.log('Request successful:', response.success);
}

/**
 * Example 3: Request with JWT token
 */
async function tokenRequestExample() {
  console.log('\n=== Example 3: Request with JWT Token ===\n');

  const request: GatewayRequest = {
    query: 'Show me my character profiles',
    userId: 'user-123',
    sessionId: 'session-456',
    connectionId: 'conn-789',
    requestId: 'req-003',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // Mock token
  };

  const response = await gateway.handleRequest(request);

  console.log('Request successful:', response.success);
  if (response.success) {
    console.log('Response:', response.content.substring(0, 200) + '...');
  } else {
    console.log('Error:', response.error);
  }
}

/**
 * Example 4: Request with retry logic
 */
async function retryRequestExample() {
  console.log('\n=== Example 4: Request with Retry ===\n');

  const request: GatewayRequest = {
    query: 'Analyze theory: Rena knows about the loops',
    userId: 'user-123',
    sessionId: 'session-456',
    connectionId: 'conn-789',
    requestId: 'req-004',
  };

  const response = await gateway.handleRequestWithRetry(request, undefined, 2);

  console.log('Request successful:', response.success);
  console.log('Response:', response.content.substring(0, 200) + '...');
}

/**
 * Example 5: Creating WebSocket responses
 */
async function websocketResponseExample() {
  console.log('\n=== Example 5: WebSocket Responses ===\n');

  // Chunk response
  const chunkResponse = gateway.createWebSocketResponse(
    'req-005',
    'chunk',
    'This is a chunk of the response...'
  );
  console.log('Chunk response:', chunkResponse);

  // Complete response
  const completeResponse = gateway.createWebSocketResponse(
    'req-005',
    'complete'
  );
  console.log('Complete response:', completeResponse);

  // Error response
  const errorResponse = gateway.createWebSocketResponse(
    'req-005',
    'error',
    undefined,
    'Something went wrong'
  );
  console.log('Error response:', errorResponse);
}

/**
 * Example 6: Multi-turn conversation
 */
async function conversationExample() {
  console.log('\n=== Example 6: Multi-turn Conversation ===\n');

  const sessionId = 'session-' + Date.now();

  // First message
  const request1: GatewayRequest = {
    query: 'Who is Rena?',
    userId: 'user-123',
    sessionId,
    connectionId: 'conn-789',
    requestId: 'req-006-1',
  };

  const response1 = await gateway.handleRequest(request1);
  console.log('Turn 1 successful:', response1.success);

  // Second message (with context from first)
  const request2: GatewayRequest = {
    query: 'What is her relationship with Keiichi?',
    userId: 'user-123',
    sessionId,
    connectionId: 'conn-789',
    requestId: 'req-006-2',
  };

  const response2 = await gateway.handleRequest(request2);
  console.log('Turn 2 successful:', response2.success);
  console.log('Response:', response2.content.substring(0, 200) + '...');
}

/**
 * Example 7: Error handling
 */
async function errorHandlingExample() {
  console.log('\n=== Example 7: Error Handling ===\n');

  // Request with invalid user
  const request: GatewayRequest = {
    query: 'Test query',
    userId: '', // Invalid
    sessionId: 'session-456',
    connectionId: 'conn-789',
    requestId: 'req-007',
  };

  const response = await gateway.handleRequest(request);

  console.log('Request successful:', response.success);
  console.log('Error:', response.error);
  console.log('User-friendly error message provided');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await basicRequestExample();
    await streamingRequestExample();
    await tokenRequestExample();
    await retryRequestExample();
    await websocketResponseExample();
    await conversationExample();
    await errorHandlingExample();

    console.log('\n=== All Examples Complete ===\n');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

export {
  basicRequestExample,
  streamingRequestExample,
  tokenRequestExample,
  retryRequestExample,
  websocketResponseExample,
  conversationExample,
  errorHandlingExample,
};
