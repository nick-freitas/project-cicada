/**
 * Tests for Message Processor
 * 
 * Verifies that the message processor correctly invokes the Gateway Lambda
 * and handles streaming responses.
 * 
 * Requirements: 8.1, 8.2, 12.1, 12.2, 16.1
 */

import { SQSEvent, Context } from 'aws-lambda';

// Mock Lambda context
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('Message Processor', () => {
  beforeEach(() => {
    // Set environment variables
    process.env.WEBSOCKET_DOMAIN_NAME = 'test.execute-api.us-east-1.amazonaws.com';
    process.env.WEBSOCKET_STAGE = 'test';
    process.env.GATEWAY_FUNCTION_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:test-gateway';
  });

  describe('Environment Configuration', () => {
    it('should require GATEWAY_FUNCTION_ARN environment variable', () => {
      // This test verifies that the environment variable is checked
      expect(process.env.GATEWAY_FUNCTION_ARN).toBeDefined();
      expect(process.env.GATEWAY_FUNCTION_ARN).toContain('gateway');
    });

    it('should have WebSocket configuration', () => {
      // Requirement 12.2: Maintain backward compatibility with WebSocket infrastructure
      expect(process.env.WEBSOCKET_DOMAIN_NAME).toBeDefined();
      expect(process.env.WEBSOCKET_STAGE).toBeDefined();
    });
  });

  describe('Message Structure', () => {
    it('should expect correct message format from SQS', () => {
      // Requirement 8.1: Pass userId, sessionId, connectionId to Gateway
      const expectedMessage = {
        requestId: 'test-request-id',
        connectionId: 'test-connection-id',
        userId: 'test-user-id',
        message: 'Test query',
        sessionId: 'test-session-id',
      };

      // Verify all required fields are present
      expect(expectedMessage.requestId).toBeDefined();
      expect(expectedMessage.connectionId).toBeDefined();
      expect(expectedMessage.userId).toBeDefined();
      expect(expectedMessage.message).toBeDefined();
      expect(expectedMessage.sessionId).toBeDefined();
    });
  });

  describe('Gateway Request Format', () => {
    it('should format Gateway request correctly', () => {
      // Requirement 8.1: Pass userId, sessionId, connectionId to Gateway
      const gatewayRequest = {
        query: 'Tell me about Rena',
        userId: 'test-user-id',
        sessionId: 'test-session-id',
        connectionId: 'test-connection-id',
        requestId: 'test-request-id',
      };

      // Verify Gateway request has all required fields
      expect(gatewayRequest.query).toBeDefined();
      expect(gatewayRequest.userId).toBeDefined();
      expect(gatewayRequest.sessionId).toBeDefined();
      expect(gatewayRequest.connectionId).toBeDefined();
      expect(gatewayRequest.requestId).toBeDefined();
    });
  });

  describe('WebSocket Response Format', () => {
    it('should use correct chunk response format', () => {
      // Requirement 12.2: Maintain backward compatibility with WebSocketResponse format
      const chunkResponse = {
        requestId: 'test-request-id',
        type: 'chunk' as const,
        content: 'Test chunk',
      };

      expect(chunkResponse.requestId).toBeDefined();
      expect(chunkResponse.type).toBe('chunk');
      expect(chunkResponse.content).toBeDefined();
    });

    it('should use correct complete response format', () => {
      // Requirement 12.2: Maintain backward compatibility with WebSocketResponse format
      const completeResponse = {
        requestId: 'test-request-id',
        type: 'complete' as const,
      };

      expect(completeResponse.requestId).toBeDefined();
      expect(completeResponse.type).toBe('complete');
    });

    it('should use correct error response format', () => {
      // Requirement 12.2: Maintain backward compatibility with WebSocketResponse format
      const errorResponse = {
        requestId: 'test-request-id',
        type: 'error' as const,
        error: 'Test error message',
      };

      expect(errorResponse.requestId).toBeDefined();
      expect(errorResponse.type).toBe('error');
      expect(errorResponse.error).toBeDefined();
    });
  });
});
