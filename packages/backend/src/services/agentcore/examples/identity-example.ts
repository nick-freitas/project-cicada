/**
 * Example usage of IdentityService
 * 
 * This demonstrates how to use the Identity service in different scenarios:
 * - Getting identity from userId
 * - Extracting identity from JWT token
 * - Validating identity
 * - Using identity in WebSocket connections
 */

import { identityService, UserIdentity } from '../identity-service';

/**
 * Example 1: Get identity from userId
 * 
 * This is useful when you already have the userId from a previous
 * authentication step or from a database record.
 */
async function exampleGetIdentity() {
  console.log('Example 1: Get identity from userId');
  
  const userId = 'user-123';
  const identity = await identityService.getUserIdentity(userId);
  
  console.log('Identity:', identity);
  // Output: { userId: 'user-123', username: 'user-123', groups: ['users'], attributes: {} }
}

/**
 * Example 2: Extract identity from JWT token
 * 
 * This is the primary authentication method for REST API requests.
 * The token comes from the Authorization header.
 */
async function exampleTokenAuthentication() {
  console.log('\nExample 2: Extract identity from JWT token');
  
  // In a real Lambda handler, you would extract this from the event
  const token = 'Bearer eyJraWQiOiJ...'; // JWT token from Authorization header
  
  try {
    const identity = await identityService.getUserIdentityFromToken(
      token.replace('Bearer ', '')
    );
    
    console.log('Authenticated user:', identity);
    // Output: { userId: 'abc-123', username: 'john.doe', email: 'john@example.com', ... }
  } catch (error) {
    console.error('Authentication failed:', error);
  }
}

/**
 * Example 3: Validate identity
 * 
 * Check if an identity object is valid before using it.
 */
async function exampleValidateIdentity() {
  console.log('\nExample 3: Validate identity');
  
  const identity: UserIdentity = {
    userId: 'user-456',
    username: 'jane.doe',
    groups: ['users', 'admins'],
    attributes: { role: 'admin' },
  };
  
  const isValid = await identityService.validateIdentity(identity);
  console.log('Identity valid:', isValid);
  // Output: true
}

/**
 * Example 4: WebSocket authentication
 * 
 * Extract identity from WebSocket connection context.
 * The authorizer adds userId to the connection context.
 */
async function exampleWebSocketAuthentication() {
  console.log('\nExample 4: WebSocket authentication');
  
  // In a real WebSocket handler, this comes from the event
  const connectionContext = {
    authorizer: {
      userId: 'ws-user-789',
      username: 'websocket-user',
    },
  };
  
  try {
    const identity = await identityService.getUserIdentityFromWebSocket(connectionContext);
    console.log('WebSocket user:', identity);
    // Output: { userId: 'ws-user-789', username: 'websocket-user', ... }
  } catch (error) {
    console.error('WebSocket authentication failed:', error);
  }
}

/**
 * Example 5: Using identity in agent invocation
 * 
 * Pass identity to agents for user-scoped operations.
 */
async function exampleAgentInvocation() {
  console.log('\nExample 5: Using identity in agent invocation');
  
  // Get identity from request
  const identity = await identityService.getUserIdentity('user-123');
  
  // Pass identity to agent
  // const response = await orchestratorAgent.processQuery({
  //   query: 'Tell me about Rena',
  //   identity,  // <-- Identity passed to agent
  //   memory: conversationMemory,
  // });
  
  console.log('Identity will be passed to agent:', identity.userId);
}

/**
 * Example 6: Lambda handler with authentication
 * 
 * Complete example of a Lambda handler using Identity service.
 */
async function exampleLambdaHandler(event: any) {
  console.log('\nExample 6: Lambda handler with authentication');
  
  try {
    // Extract token from Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'No authorization header' }),
      };
    }
    
    // Get identity from token
    const token = authHeader.replace('Bearer ', '');
    const identity = await identityService.getUserIdentityFromToken(token);
    
    // Validate identity
    const isValid = await identityService.validateIdentity(identity);
    if (!isValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid identity' }),
      };
    }
    
    // Process request with identity
    console.log('Processing request for user:', identity.userId);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success',
        userId: identity.userId,
      }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

// Run examples
async function runExamples() {
  await exampleGetIdentity();
  // await exampleTokenAuthentication(); // Requires valid token
  await exampleValidateIdentity();
  // await exampleWebSocketAuthentication(); // Requires WebSocket context
  await exampleAgentInvocation();
}

// Uncomment to run examples
// runExamples().catch(console.error);
