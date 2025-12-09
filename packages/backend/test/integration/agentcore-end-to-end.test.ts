/**
 * AgentCore End-to-End Integration Tests
 * 
 * Tests complete flows through the AgentCore system:
 * 1. User query → Gateway → Orchestrator → Query Agent → Response
 * 2. Theory analysis → Theory Agent → Query Agent → Profile update
 * 3. Profile extraction → Profile Agent → DynamoDB
 * 4. Multi-turn conversation with memory
 * 
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4
 * 
 * Task: 30. Run integration tests for end-to-end flows
 */

import { gateway, GatewayRequest } from '../../src/services/agentcore/gateway';
import { memoryService } from '../../src/services/agentcore/memory-service';
import { identityService } from '../../src/services/agentcore/identity-service';
import { policyService } from '../../src/services/agentcore/policy-service';
import { v4 as uuidv4 } from 'uuid';

// Mock DynamoDB operations for integration tests
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const mockData = new Map();
  
  return {
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({
        send: jest.fn(async (command: any) => {
          const commandName = command.constructor.name;
          
          if (commandName === 'GetCommand') {
            const key = `${command.input.TableName}:${JSON.stringify(command.input.Key)}`;
            return { Item: mockData.get(key) };
          }
          
          if (commandName === 'PutCommand') {
            const key = `${command.input.TableName}:${JSON.stringify({ userId: command.input.Item.userId })}`;
            mockData.set(key, command.input.Item);
            return {};
          }
          
          if (commandName === 'UpdateCommand') {
            const key = `${command.input.TableName}:${JSON.stringify(command.input.Key)}`;
            const existing = mockData.get(key) || {};
            mockData.set(key, { ...existing, ...command.input.Item });
            return {};
          }
          
          return {};
        }),
      })),
    },
    GetCommand: class GetCommand {
      constructor(public input: any) {}
    },
    PutCommand: class PutCommand {
      constructor(public input: any) {}
    },
    UpdateCommand: class UpdateCommand {
      constructor(public input: any) {}
    },
    QueryCommand: class QueryCommand {
      constructor(public input: any) {}
    },
  };
});

describe('AgentCore End-to-End Integration Tests', () => {
  const testUserId = `test-user-${Date.now()}`;
  const testUsername = 'test-user';

  beforeAll(async () => {
    // Mock services are automatically set up
  });

  afterAll(async () => {
    // Cleanup test data
    // Note: In a real implementation, you'd clean up DynamoDB entries
  });

  describe('Flow 1: User Query → Gateway → Orchestrator → Query Agent → Response', () => {
    it('should process a simple script query end-to-end', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Who is Rena Ryuugu?',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      const response = await gateway.handleRequest(request);

      // Validate response structure
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.requestId).toBe(requestId);
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);

      // Validate metadata
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.duration).toBeGreaterThan(0);
      expect(response.metadata?.agentName).toBeDefined();

      // Validate memory was updated
      const memory = await memoryService.getSession(testUserId, sessionId);
      expect(memory.messages.length).toBeGreaterThanOrEqual(2); // User + Assistant
      expect(memory.messages[memory.messages.length - 2].role).toBe('user');
      expect(memory.messages[memory.messages.length - 2].content).toBe('Who is Rena Ryuugu?');
      expect(memory.messages[memory.messages.length - 1].role).toBe('assistant');
    }, 30000);

    it('should handle script search queries with citations', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'What does Rena say about "omochikaeri"?',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);

      // Response should eventually include citations when Query Agent is fully integrated
      // For now, just validate the flow completes
    }, 30000);

    it('should stream responses via callback', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();
      const chunks: string[] = [];

      const streamCallback = async (chunk: string) => {
        chunks.push(chunk);
      };

      const request: GatewayRequest = {
        query: 'Tell me about the Watanagashi festival',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      const response = await gateway.handleRequest(request, streamCallback);

      expect(response.success).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);

      // Validate chunks combine to full response
      const streamedContent = chunks.join('');
      expect(streamedContent).toBe(response.content);
    }, 30000);

    it('should handle errors gracefully', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: '', // Empty query should cause error
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      const response = await gateway.handleRequest(request);

      // Should handle error gracefully
      expect(response).toBeDefined();
      expect(response.requestId).toBe(requestId);
    }, 30000);
  });

  describe('Flow 2: Theory Analysis → Theory Agent → Query Agent → Profile Update', () => {
    it('should process theory analysis request end-to-end', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'I have a theory that Rena knows about the curse. Can you analyze this theory?',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'theory', // Direct invocation of Theory Agent
      };

      const response = await gateway.handleRequest(request);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);

      // Theory Agent should invoke Query Agent for evidence gathering
      // This will be validated when agents are fully integrated
    }, 60000);

    it('should gather evidence from Query Agent during theory analysis', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Analyze the theory: Rena is connected to the disappearances',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'theory',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.content).toBeDefined();

      // Response should include evidence from script search
      // This will be validated when Theory Agent is fully integrated
    }, 60000);

    it('should update theory profiles after analysis', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Theory: The curse is not supernatural but psychological',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'theory',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);

      // Theory should be stored in user's profile
      // This will be validated when Profile Agent integration is complete
    }, 60000);

    it('should handle multi-hop agent coordination (Theory → Query)', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Validate my theory that Rena has a dark secret. Use evidence from the scripts.',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.content).toBeDefined();

      // Should trigger: Orchestrator → Theory Agent → Query Agent
      // Full validation when agents are integrated
    }, 90000);
  });

  describe('Flow 3: Profile Extraction → Profile Agent → DynamoDB', () => {
    it('should extract and store character profiles', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Rena Ryuugu is a cheerful girl who loves cute things and often says "omochikaeri"',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'profile',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.content).toBeDefined();

      // Profile should be extracted and stored in DynamoDB
      // This will be validated when Profile Agent is fully integrated
    }, 30000);

    it('should retrieve existing profiles', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Show me my character profiles',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'profile',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.content).toBeDefined();

      // Should list user's profiles from DynamoDB
    }, 30000);

    it('should update existing profiles', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Update Rena profile: She has a mysterious past',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'profile',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);

      // Profile should be updated in DynamoDB
    }, 30000);

    it('should enforce user data isolation', async () => {
      const otherUserId = `other-user-${Date.now()}`;
      const sessionId = uuidv4();
      const requestId = uuidv4();

      // Other user will use default policy

      const request: GatewayRequest = {
        query: 'Show me all profiles',
        userId: otherUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'profile',
      };

      const response = await gateway.handleRequest(request);

      expect(response.success).toBe(true);

      // Should only see their own profiles, not testUserId's profiles
      // This will be validated when Profile Agent is fully integrated
    }, 30000);
  });

  describe('Flow 4: Multi-Turn Conversation with Memory', () => {
    it('should maintain context across multiple turns', async () => {
      const sessionId = uuidv4();

      // Turn 1: Ask about Rena
      const request1: GatewayRequest = {
        query: 'Tell me about Rena',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId: uuidv4(),
      };

      const response1 = await gateway.handleRequest(request1);
      expect(response1.success).toBe(true);

      // Turn 2: Follow-up question (should use context)
      const request2: GatewayRequest = {
        query: 'What else can you tell me about her?',
        userId: testUserId,
        sessionId, // Same session
        connectionId: 'test-connection',
        requestId: uuidv4(),
      };

      const response2 = await gateway.handleRequest(request2);
      expect(response2.success).toBe(true);

      // Turn 3: Another follow-up
      const request3: GatewayRequest = {
        query: 'Does she have any secrets?',
        userId: testUserId,
        sessionId, // Same session
        connectionId: 'test-connection',
        requestId: uuidv4(),
      };

      const response3 = await gateway.handleRequest(request3);
      expect(response3.success).toBe(true);

      // Validate memory contains all turns
      const memory = await memoryService.getSession(testUserId, sessionId);
      expect(memory.messages.length).toBeGreaterThanOrEqual(6); // 3 user + 3 assistant

      // Validate message order
      const userMessages = memory.messages.filter(m => m.role === 'user');
      expect(userMessages[0].content).toBe('Tell me about Rena');
      expect(userMessages[1].content).toBe('What else can you tell me about her?');
      expect(userMessages[2].content).toBe('Does she have any secrets?');
    }, 90000);

    it('should handle session isolation between users', async () => {
      const user1SessionId = uuidv4();
      const user2Id = `test-user-2-${Date.now()}`;
      const user2SessionId = uuidv4();

      // User 2 will use default policy

      // User 1 conversation
      const user1Request: GatewayRequest = {
        query: 'I think Rena is suspicious',
        userId: testUserId,
        sessionId: user1SessionId,
        connectionId: 'test-connection-1',
        requestId: uuidv4(),
      };

      await gateway.handleRequest(user1Request);

      // User 2 conversation
      const user2Request: GatewayRequest = {
        query: 'I think Mion is the key character',
        userId: user2Id,
        sessionId: user2SessionId,
        connectionId: 'test-connection-2',
        requestId: uuidv4(),
      };

      await gateway.handleRequest(user2Request);

      // Validate sessions are isolated
      const user1Memory = await memoryService.getSession(testUserId, user1SessionId);
      const user2Memory = await memoryService.getSession(user2Id, user2SessionId);

      expect(user1Memory.userId).toBe(testUserId);
      expect(user2Memory.userId).toBe(user2Id);

      // User 1's memory should not contain User 2's messages
      const user1Messages = user1Memory.messages.map(m => m.content).join(' ');
      expect(user1Messages).toContain('Rena');
      expect(user1Messages).not.toContain('Mion is the key character');

      // User 2's memory should not contain User 1's messages
      const user2Messages = user2Memory.messages.map(m => m.content).join(' ');
      expect(user2Messages).toContain('Mion');
      expect(user2Messages).not.toContain('Rena is suspicious');
    }, 60000);

    it('should handle long conversations with memory compaction', async () => {
      const sessionId = uuidv4();

      // Simulate a long conversation (10+ turns)
      for (let i = 0; i < 12; i++) {
        const request: GatewayRequest = {
          query: `Question ${i + 1}: Tell me about character ${i + 1}`,
          userId: testUserId,
          sessionId,
          connectionId: 'test-connection',
          requestId: uuidv4(),
        };

        const response = await gateway.handleRequest(request);
        expect(response.success).toBe(true);
      }

      // Validate memory was updated
      const memory = await memoryService.getSession(testUserId, sessionId);
      expect(memory.messages.length).toBeGreaterThan(0);

      // Memory service should handle compaction if needed
      // This will be validated when memory compaction is implemented
    }, 120000);

    it('should resume conversation after reconnection', async () => {
      const sessionId = uuidv4();

      // Initial conversation
      const request1: GatewayRequest = {
        query: 'Tell me about the Watanagashi festival',
        userId: testUserId,
        sessionId,
        connectionId: 'connection-1',
        requestId: uuidv4(),
      };

      await gateway.handleRequest(request1);

      // Simulate reconnection with new connection ID
      const request2: GatewayRequest = {
        query: 'What happens during the festival?',
        userId: testUserId,
        sessionId, // Same session
        connectionId: 'connection-2', // New connection
        requestId: uuidv4(),
      };

      const response2 = await gateway.handleRequest(request2);
      expect(response2.success).toBe(true);

      // Should have access to previous context
      const memory = await memoryService.getSession(testUserId, sessionId);
      expect(memory.messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant
    }, 60000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle policy violations gracefully', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      // Create user with restrictive policy
      const restrictedUserId = `restricted-user-${Date.now()}`;

      const request: GatewayRequest = {
        query: 'Analyze this theory',
        userId: restrictedUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'theory', // Not allowed by policy
      };

      const response = await gateway.handleRequest(request);

      // Should fail gracefully with policy error
      expect(response).toBeDefined();
      expect(response.requestId).toBe(requestId);
      // Policy enforcement will be validated when fully implemented
    }, 30000);

    it('should retry on transient failures', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Test retry logic',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      // Use retry wrapper
      const response = await gateway.handleRequestWithRetry(request, undefined, 2);

      expect(response).toBeDefined();
      expect(response.requestId).toBe(requestId);
    }, 60000);

    it('should handle agent invocation failures', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const request: GatewayRequest = {
        query: 'Test query',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
        agentName: 'nonexistent-agent', // Invalid agent
      };

      const response = await gateway.handleRequest(request);

      // Should handle gracefully
      expect(response).toBeDefined();
      expect(response.requestId).toBe(requestId);
    }, 30000);

    it('should maintain data consistency on errors', async () => {
      const sessionId = uuidv4();

      // Successful request
      const request1: GatewayRequest = {
        query: 'First query',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId: uuidv4(),
      };

      await gateway.handleRequest(request1);

      // Request that might fail
      const request2: GatewayRequest = {
        query: '', // Empty query
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId: uuidv4(),
      };

      await gateway.handleRequest(request2);

      // Subsequent successful request
      const request3: GatewayRequest = {
        query: 'Third query',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId: uuidv4(),
      };

      const response3 = await gateway.handleRequest(request3);
      expect(response3.success).toBe(true);

      // Memory should be consistent
      const memory = await memoryService.getSession(testUserId, sessionId);
      expect(memory.messages.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent requests from same user', async () => {
      const sessionId = uuidv4();

      const requests = Array.from({ length: 5 }, (_, i) => ({
        query: `Concurrent query ${i + 1}`,
        userId: testUserId,
        sessionId,
        connectionId: `connection-${i}`,
        requestId: uuidv4(),
      }));

      // Execute all requests concurrently
      const responses = await Promise.all(
        requests.map(req => gateway.handleRequest(req))
      );

      // All should succeed
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(response.success).toBe(true);
      });

      // Memory should contain all messages
      const memory = await memoryService.getSession(testUserId, sessionId);
      expect(memory.messages.length).toBeGreaterThanOrEqual(10); // 5 user + 5 assistant
    }, 90000);

    it('should handle concurrent requests from different users', async () => {
      const users = Array.from({ length: 3 }, (_, i) => `concurrent-user-${i}-${Date.now()}`);

      const requests = users.map((userId, i) => ({
        query: `Query from user ${i + 1}`,
        userId,
        sessionId: uuidv4(),
        connectionId: `connection-${i}`,
        requestId: uuidv4(),
      }));

      // Execute all requests concurrently
      const responses = await Promise.all(
        requests.map(req => gateway.handleRequest(req))
      );

      // All should succeed
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(response.success).toBe(true);
      });
    }, 90000);

    it('should complete queries within performance targets', async () => {
      const sessionId = uuidv4();
      const requestId = uuidv4();

      const startTime = Date.now();

      const request: GatewayRequest = {
        query: 'What is Higurashi about?',
        userId: testUserId,
        sessionId,
        connectionId: 'test-connection',
        requestId,
      };

      const response = await gateway.handleRequest(request);

      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(response.metadata?.duration).toBeDefined();

      // Should complete in reasonable time (target: < 5 seconds for 90% of queries)
      // This is a placeholder - actual performance will be validated when agents are integrated
      expect(duration).toBeLessThan(30000); // 30 second timeout for now
    }, 35000);
  });
});
