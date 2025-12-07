import * as fc from 'fast-check';
import { Message } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 21: Session Context Continuity
 * Validates: Requirements 12.1
 * 
 * For any message within a session, the system SHALL have access to all previous messages in that session.
 */

// Set up mock before any imports
let mockSessions: Map<string, any>;
const mockSend = jest.fn();

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockSend })),
    },
    PutCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'PutCommand' }, input })),
    GetCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'GetCommand' }, input })),
    QueryCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'QueryCommand' }, input })),
    UpdateCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'UpdateCommand' }, input })),
    DeleteCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'DeleteCommand' }, input })),
  };
});

// Import after mocks are set up
import { MemoryService } from '../../src/services/memory-service';

describe('Property 21: Session Context Continuity', () => {
  let service: MemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessions = new Map();
    service = new MemoryService();

    // Mock DynamoDB operations to use in-memory storage
    mockSend.mockImplementation((command: any) => {
      const commandName = command.constructor.name;

      try {
        if (commandName === 'PutCommand') {
          const key = `${command.input.Item.userId}#${command.input.Item.sessionKey}`;
          mockSessions.set(key, command.input.Item);
          return Promise.resolve({});
        }

        if (commandName === 'QueryCommand') {
          const userId = command.input.ExpressionAttributeValues[':userId'];
          const items = Array.from(mockSessions.values()).filter((item) => item.userId === userId);

          // Filter by sessionKey prefix if specified
          if (command.input.KeyConditionExpression?.includes('begins_with')) {
            const prefix = command.input.ExpressionAttributeValues[':sessionId'];
            const filtered = items.filter((item) => item.sessionKey.startsWith(prefix));
            
            // Apply limit if specified
            const limit = command.input.Limit || filtered.length;
            return Promise.resolve({
              Items: filtered.slice(0, limit),
            });
          }

          // Apply limit and sort order
          const limit = command.input.Limit || items.length;
          const sorted = command.input.ScanIndexForward === false ? items.reverse() : items;
          return Promise.resolve({ Items: sorted.slice(0, limit) });
        }

        if (commandName === 'UpdateCommand') {
          const key = `${command.input.Key.userId}#${command.input.Key.sessionKey}`;
          const item = mockSessions.get(key);
          if (item) {
            const updates = command.input.ExpressionAttributeValues;
            mockSessions.set(key, {
              ...item,
              sessionData: updates[':sessionData'],
            });
          }
          return Promise.resolve({});
        }

        if (commandName === 'DeleteCommand') {
          const key = `${command.input.Key.userId}#${command.input.Key.sessionKey}`;
          mockSessions.delete(key);
          return Promise.resolve({});
        }

        return Promise.resolve({});
      } catch (error) {
        return Promise.reject(error);
      }
    });
  });

  it('should maintain access to all previous messages within a session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 10 }),
        async (userId, sessionId, messageContents) => {
          // Create a session
          await service.createSession(userId, sessionId);

          // Add messages one by one
          for (let i = 0; i < messageContents.length; i++) {
            const message: Message = {
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: messageContents[i],
              timestamp: new Date().toISOString(),
            };

            await service.addMessage(userId, sessionId, message);

            // Property: After adding message i, all messages 0..i should be accessible
            const messages = await service.getSessionMessages(userId, sessionId);
            expect(messages.length).toBe(i + 1);

            // Verify all previous messages are present
            for (let j = 0; j <= i; j++) {
              expect(messages[j].content).toBe(messageContents[j]);
            }
          }

          // Property: Final check - all messages should be accessible
          const allMessages = await service.getSessionMessages(userId, sessionId);
          expect(allMessages.length).toBe(messageContents.length);

          for (let i = 0; i < messageContents.length; i++) {
            expect(allMessages[i].content).toBe(messageContents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve message order within a session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 3, maxLength: 15 }),
        async (userId, sessionId, messageContents) => {
          // Create a session
          await service.createSession(userId, sessionId);

          // Add all messages
          for (let i = 0; i < messageContents.length; i++) {
            const message: Message = {
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: messageContents[i],
              timestamp: new Date(Date.now() + i * 1000).toISOString(),
            };

            await service.addMessage(userId, sessionId, message);
          }

          // Property: Messages should be in the same order they were added
          const messages = await service.getSessionMessages(userId, sessionId);
          expect(messages.length).toBe(messageContents.length);

          for (let i = 0; i < messageContents.length; i++) {
            expect(messages[i].content).toBe(messageContents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain context even after context compaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 500, maxLength: 1000 }), { minLength: 15, maxLength: 20 }),
        async (userId, sessionId, messageContents) => {
          // Create a service with small max context size to trigger compaction
          const smallService = new MemoryService({ maxContextSize: 5000 });

          // Create a session
          await smallService.createSession(userId, sessionId);

          // Add messages that will trigger compaction
          for (let i = 0; i < messageContents.length; i++) {
            const message: Message = {
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: messageContents[i],
              timestamp: new Date(Date.now() + i * 1000).toISOString(),
            };

            await smallService.addMessage(userId, sessionId, message);
          }

          // Property: Even after compaction, recent messages should be accessible
          const messages = await smallService.getSessionMessages(userId, sessionId);
          
          // Recent messages should be preserved (at least some)
          expect(messages.length).toBeGreaterThan(0);
          expect(messages.length).toBeLessThanOrEqual(messageContents.length);

          // The most recent messages should match
          const recentCount = messages.length;
          for (let i = 0; i < recentCount; i++) {
            const messageIndex = i;
            const contentIndex = messageContents.length - recentCount + i;
            expect(messages[messageIndex].content).toBe(messageContents[contentIndex]);
          }

          // Property: Session should have compacted context if compaction occurred
          const session = await smallService.getSession(userId, sessionId);
          if (messages.length < messageContents.length) {
            expect(session?.compactedContext).toBeDefined();
            expect(session?.compactedContext).not.toBe('');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain separate context for concurrent messages in the same session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.tuple(
          fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
          fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 2, maxLength: 5 })
        ),
        async (userId, sessionId, [batch1, batch2]) => {
          // Create a session
          await service.createSession(userId, sessionId);

          // Add first batch
          for (const content of batch1) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(userId, sessionId, message);
          }

          // Add second batch
          for (const content of batch2) {
            const message: Message = {
              role: 'assistant',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(userId, sessionId, message);
          }

          // Property: All messages from both batches should be accessible
          const messages = await service.getSessionMessages(userId, sessionId);
          expect(messages.length).toBe(batch1.length + batch2.length);

          // Verify all messages are present
          const allContents = [...batch1, ...batch2];
          for (let i = 0; i < allContents.length; i++) {
            expect(messages[i].content).toBe(allContents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
