/**
 * Unit tests for PolicyService
 * 
 * Tests the core functionality of the AgentCore Policy service:
 * - Policy retrieval (default and custom)
 * - Policy enforcement (agent access, data isolation)
 * - Rate limiting
 * - Policy persistence
 */

import { PolicyService, AgentPolicy } from '../policy-service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(() => {
    ddbMock.reset();
    service = new PolicyService(new DynamoDBClient({}));
  });

  describe('getPolicy', () => {
    it('should return custom policy when it exists', async () => {
      const customPolicy: AgentPolicy = {
        userId: 'user123',
        allowedAgents: ['query', 'theory'],
        dataIsolation: 'shared',
        maxTokens: 4096,
        rateLimit: 200,
      };

      ddbMock.on(GetCommand).resolves({
        Item: customPolicy,
      });

      const result = await service.getPolicy('user123');

      expect(result).toEqual(customPolicy);
      expect(ddbMock).toHaveReceivedCommandWith(GetCommand, {
        TableName: 'AgentCorePolicies',
        Key: { userId: 'user123' },
      });
    });

    it('should return default policy when no custom policy exists', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const result = await service.getPolicy('user456');

      expect(result.userId).toBe('user456');
      expect(result.allowedAgents).toEqual(['orchestrator', 'query', 'theory', 'profile']);
      expect(result.dataIsolation).toBe('strict');
      expect(result.maxTokens).toBe(2048);
      expect(result.rateLimit).toBe(100);
    });

    it('should return default policy on error', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const result = await service.getPolicy('user789');

      expect(result.userId).toBe('user789');
      expect(result.allowedAgents).toEqual(['orchestrator', 'query', 'theory', 'profile']);
      expect(result.dataIsolation).toBe('strict');
    });
  });

  describe('enforcePolicy', () => {
    const testPolicy: AgentPolicy = {
      userId: 'user123',
      allowedAgents: ['orchestrator', 'query'],
      dataIsolation: 'strict',
      maxTokens: 2048,
      rateLimit: 100,
    };

    it('should allow request when all checks pass', async () => {
      // Mock rate limit check - no existing entry
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await service.enforcePolicy(testPolicy, {
        userId: 'user123',
        agentName: 'query',
      });

      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(99);
    });

    it('should deny request when agent not allowed', async () => {
      // Mock rate limit check - allow
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await service.enforcePolicy(testPolicy, {
        userId: 'user123',
        agentName: 'profile', // Not in allowedAgents
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted');
    });

    it('should deny request when data isolation violated', async () => {
      // Mock rate limit check - allow
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await service.enforcePolicy(testPolicy, {
        userId: 'user123',
        agentName: 'query',
        targetUserId: 'user456', // Different user
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('strict isolation');
    });

    it('should allow cross-user access with shared isolation', async () => {
      const sharedPolicy: AgentPolicy = {
        ...testPolicy,
        dataIsolation: 'shared',
      };

      // Mock rate limit check - allow
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await service.enforcePolicy(sharedPolicy, {
        userId: 'user123',
        agentName: 'query',
        targetUserId: 'user456',
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny request when rate limit exceeded', async () => {
      // Mock rate limit check - limit exceeded
      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user123',
          windowStart: Date.now(),
          requestCount: 100, // At limit
          ttl: Math.floor((Date.now() + 7200000) / 1000),
        },
      });

      const result = await service.enforcePolicy(testPolicy, {
        userId: 'user123',
        agentName: 'query',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
      expect(result.remainingRequests).toBe(0);
    });

    it('should increment rate limit counter on allowed request', async () => {
      // Mock rate limit check - existing entry with count
      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user123',
          windowStart: Date.now(),
          requestCount: 50,
          ttl: Math.floor((Date.now() + 7200000) / 1000),
        },
      });
      ddbMock.on(UpdateCommand).resolves({});

      const result = await service.enforcePolicy(testPolicy, {
        userId: 'user123',
        agentName: 'query',
      });

      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(49); // 100 - 51

      expect(ddbMock).toHaveReceivedCommandWith(UpdateCommand, {
        TableName: 'AgentCoreRateLimits',
        Key: { userId: 'user123' },
        UpdateExpression: 'SET requestCount = :count',
        ExpressionAttributeValues: {
          ':count': 51,
        },
      });
    });

    it('should reset rate limit window when expired', async () => {
      const oldWindowStart = Date.now() - 7200000; // 2 hours ago

      // Mock rate limit check - expired window
      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user123',
          windowStart: oldWindowStart,
          requestCount: 100,
          ttl: Math.floor((Date.now() + 7200000) / 1000),
        },
      });
      ddbMock.on(PutCommand).resolves({});

      const result = await service.enforcePolicy(testPolicy, {
        userId: 'user123',
        agentName: 'query',
      });

      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(99);

      // Should create new entry with count 1
      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'AgentCoreRateLimits',
        Item: expect.objectContaining({
          userId: 'user123',
          requestCount: 1,
        }),
      });
    });
  });

  describe('savePolicy', () => {
    it('should save policy to DynamoDB', async () => {
      const policy: AgentPolicy = {
        userId: 'user123',
        allowedAgents: ['query', 'theory'],
        dataIsolation: 'strict',
        maxTokens: 4096,
        rateLimit: 200,
      };

      ddbMock.on(PutCommand).resolves({});

      await service.savePolicy(policy);

      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'AgentCorePolicies',
        Item: expect.objectContaining({
          userId: 'user123',
          allowedAgents: ['query', 'theory'],
          dataIsolation: 'strict',
          maxTokens: 4096,
          rateLimit: 200,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      });
    });

    it('should throw error on save failure', async () => {
      const policy: AgentPolicy = {
        userId: 'user123',
        allowedAgents: ['query'],
        dataIsolation: 'strict',
        maxTokens: 2048,
        rateLimit: 100,
      };

      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(service.savePolicy(policy)).rejects.toThrow(
        'Failed to save policy for user user123'
      );
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit counter', async () => {
      ddbMock.on(PutCommand).resolves({});

      await service.resetRateLimit('user123');

      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'AgentCoreRateLimits',
        Item: expect.objectContaining({
          userId: 'user123',
          requestCount: 0,
        }),
      });
    });

    it('should throw error on reset failure', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(service.resetRateLimit('user123')).rejects.toThrow(
        'Failed to reset rate limit for user user123'
      );
    });
  });
});
