/**
 * Unit tests for AgentCore Gateway
 */

// Mock the services BEFORE importing
jest.mock('../identity-service', () => ({
  identityService: {
    getUserIdentity: jest.fn(),
    getUserIdentityFromToken: jest.fn(),
    validateIdentity: jest.fn(),
  },
  IdentityService: jest.fn(),
}));

jest.mock('../policy-service', () => ({
  policyService: {
    getPolicy: jest.fn(),
    enforcePolicy: jest.fn(),
  },
  PolicyService: jest.fn(),
}));

jest.mock('../memory-service', () => ({
  memoryService: {
    getSession: jest.fn(),
    addMessage: jest.fn(),
  },
  MemoryService: jest.fn(),
}));

import { Gateway, GatewayRequest } from '../gateway';
import { identityService, UserIdentity } from '../identity-service';
import { policyService, AgentPolicy } from '../policy-service';
import { memoryService } from '../memory-service';
import { ConversationMemory } from '../../../agents/types/memory';

describe('Gateway', () => {
  let gateway: Gateway;
  let mockIdentity: UserIdentity;
  let mockPolicy: AgentPolicy;
  let mockMemory: ConversationMemory;

  beforeEach(() => {
    gateway = new Gateway();

    // Setup mock identity
    mockIdentity = {
      userId: 'test-user-123',
      username: 'testuser',
      groups: ['users'],
      attributes: {},
    };

    // Setup mock policy
    mockPolicy = {
      userId: 'test-user-123',
      allowedAgents: ['orchestrator', 'query', 'theory', 'profile'],
      dataIsolation: 'strict',
      maxTokens: 2048,
      rateLimit: 100,
    };

    // Setup mock memory
    mockMemory = {
      userId: 'test-user-123',
      sessionId: 'session-456',
      messages: [],
      lastAccessed: new Date(),
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('handleRequest', () => {
    it('should successfully handle a valid request', async () => {
      // Setup mocks
      (identityService.getUserIdentity as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(true);
      (policyService.getPolicy as jest.Mock).mockResolvedValue(mockPolicy);
      (policyService.enforcePolicy as jest.Mock).mockResolvedValue({
        allowed: true,
        remainingRequests: 99,
      });
      (memoryService.getSession as jest.Mock).mockResolvedValue(mockMemory);
      (memoryService.addMessage as jest.Mock).mockResolvedValue(undefined);

      const request: GatewayRequest = {
        query: 'Tell me about Rena',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-001',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.requestId).toBe('req-001');
      expect(response.content).toBeTruthy();
      expect(response.error).toBeUndefined();

      // Verify services were called
      expect(identityService.getUserIdentity).toHaveBeenCalledWith('test-user-123');
      expect(identityService.validateIdentity).toHaveBeenCalledWith(mockIdentity);
      expect(policyService.getPolicy).toHaveBeenCalledWith('test-user-123');
      expect(policyService.enforcePolicy).toHaveBeenCalled();
      expect(memoryService.getSession).toHaveBeenCalledWith('test-user-123', 'session-456');
      expect(memoryService.addMessage).toHaveBeenCalledTimes(2); // User + assistant messages
    });

    it('should handle identity extraction from token', async () => {
      (identityService.getUserIdentityFromToken as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(true);
      (policyService.getPolicy as jest.Mock).mockResolvedValue(mockPolicy);
      (policyService.enforcePolicy as jest.Mock).mockResolvedValue({
        allowed: true,
        remainingRequests: 99,
      });
      (memoryService.getSession as jest.Mock).mockResolvedValue(mockMemory);
      (memoryService.addMessage as jest.Mock).mockResolvedValue(undefined);

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-002',
        token: 'mock-jwt-token',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(identityService.getUserIdentityFromToken).toHaveBeenCalledWith('mock-jwt-token');
      expect(identityService.getUserIdentity).not.toHaveBeenCalled();
    });

    it('should reject request when policy enforcement fails', async () => {
      (identityService.getUserIdentity as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(true);
      (policyService.getPolicy as jest.Mock).mockResolvedValue(mockPolicy);
      (policyService.enforcePolicy as jest.Mock).mockResolvedValue({
        allowed: false,
        reason: 'Rate limit exceeded',
      });

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-003',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Rate limit exceeded');
      expect(memoryService.getSession).not.toHaveBeenCalled();
    });

    it('should handle invalid identity', async () => {
      (identityService.getUserIdentity as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(false);

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-004',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Authentication failed');
    });

    it('should handle streaming with callback', async () => {
      (identityService.getUserIdentity as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(true);
      (policyService.getPolicy as jest.Mock).mockResolvedValue(mockPolicy);
      (policyService.enforcePolicy as jest.Mock).mockResolvedValue({
        allowed: true,
        remainingRequests: 99,
      });
      (memoryService.getSession as jest.Mock).mockResolvedValue(mockMemory);
      (memoryService.addMessage as jest.Mock).mockResolvedValue(undefined);

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-005',
      };

      const chunks: string[] = [];
      const streamCallback = async (chunk: string) => {
        chunks.push(chunk);
      };

      const response = await gateway.handleRequest(request, streamCallback);

      expect(response.success).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe(response.content);
    });

    it('should return user-friendly error messages', async () => {
      (identityService.getUserIdentity as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired token')
      );

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-006',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Your session has expired. Please log in again.');
    });
  });

  describe('handleRequestWithRetry', () => {
    it('should succeed on first attempt', async () => {
      (identityService.getUserIdentity as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(true);
      (policyService.getPolicy as jest.Mock).mockResolvedValue(mockPolicy);
      (policyService.enforcePolicy as jest.Mock).mockResolvedValue({
        allowed: true,
        remainingRequests: 99,
      });
      (memoryService.getSession as jest.Mock).mockResolvedValue(mockMemory);
      (memoryService.addMessage as jest.Mock).mockResolvedValue(undefined);

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-007',
      };

      const response = await gateway.handleRequestWithRetry(request);

      expect(response.success).toBe(true);
      expect(identityService.getUserIdentity).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      // Test that retry logic works by having the service fail then succeed
      let attemptCount = 0;
      (identityService.getUserIdentity as jest.Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          // Throw a retryable error
          throw new Error('Service unavailable - connection timeout');
        }
        return Promise.resolve(mockIdentity);
      });
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(true);
      (policyService.getPolicy as jest.Mock).mockResolvedValue(mockPolicy);
      (policyService.enforcePolicy as jest.Mock).mockResolvedValue({
        allowed: true,
        remainingRequests: 99,
      });
      (memoryService.getSession as jest.Mock).mockResolvedValue(mockMemory);
      (memoryService.addMessage as jest.Mock).mockResolvedValue(undefined);

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-008',
      };

      const response = await gateway.handleRequestWithRetry(request, undefined, 2);

      // The first attempt will fail with a retryable error, which gets converted
      // to a user-friendly message with [retryable] marker. The retry logic
      // recognizes this marker and retries, succeeding on the second attempt.
      expect(response.success).toBe(true);
      expect(attemptCount).toBe(2);
    });

    it('should not retry on non-retryable errors', async () => {
      (identityService.getUserIdentity as jest.Mock).mockResolvedValue(mockIdentity);
      (identityService.validateIdentity as jest.Mock).mockResolvedValue(false);

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-009',
      };

      const response = await gateway.handleRequestWithRetry(request, undefined, 2);

      expect(response.success).toBe(false);
      expect(identityService.getUserIdentity).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      // Mock always throws a retryable error
      (identityService.getUserIdentity as jest.Mock).mockRejectedValue(
        new Error('Service unavailable - network error')
      );

      const request: GatewayRequest = {
        query: 'Test query',
        userId: 'test-user-123',
        sessionId: 'session-456',
        connectionId: 'conn-789',
        requestId: 'req-010',
      };

      const response = await gateway.handleRequestWithRetry(request, undefined, 2);

      expect(response.success).toBe(false);
      // Should have been called 3 times (initial + 2 retries)
      expect(identityService.getUserIdentity).toHaveBeenCalledTimes(3);
    });
  });

  describe('createWebSocketResponse', () => {
    it('should create chunk response', () => {
      const response = gateway.createWebSocketResponse(
        'req-001',
        'chunk',
        'Hello world'
      );

      expect(response).toEqual({
        requestId: 'req-001',
        type: 'chunk',
        content: 'Hello world',
        error: undefined,
      });
    });

    it('should create complete response', () => {
      const response = gateway.createWebSocketResponse(
        'req-002',
        'complete'
      );

      expect(response).toEqual({
        requestId: 'req-002',
        type: 'complete',
        content: undefined,
        error: undefined,
      });
    });

    it('should create error response', () => {
      const response = gateway.createWebSocketResponse(
        'req-003',
        'error',
        undefined,
        'Something went wrong'
      );

      expect(response).toEqual({
        requestId: 'req-003',
        type: 'error',
        content: undefined,
        error: 'Something went wrong',
      });
    });
  });
});
