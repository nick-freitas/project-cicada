import * as fc from 'fast-check';
import { Message } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 24: Context Compaction
 * Validates: Requirements 12.5
 * 
 * For any conversation context exceeding a threshold size, older context SHALL be compacted or summarized.
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

describe('Property 24: Context Compaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessions = new Map();

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

  it('should compact context when size exceeds threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 500, maxLength: 1000 }), { minLength: 12, maxLength: 18 }),
        async (userId, sessionId, messageContents) => {
          // Create service with small threshold to trigger compaction
          const smallService = new MemoryService({ maxContextSize: 10000 });

          // Create session
          await smallService.createSession(userId, sessionId);

          // Add messages that will exceed threshold
          for (const content of messageContents) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await smallService.addMessage(userId, sessionId, message);
          }

          // Property: Session should have compacted context
          const session = await smallService.getSession(userId, sessionId);
          expect(session).not.toBeNull();

          // Property: If we added enough messages to trigger compaction
          const estimatedSize = messageContents.reduce((sum, c) => sum + c.length, 0);
          if (estimatedSize > 10000) {
            // Property: Compacted context should exist
            expect(session?.compactedContext).toBeDefined();
            expect(session?.compactedContext).not.toBe('');

            // Property: Messages should be reduced after compaction
            expect(session?.messages.length).toBeLessThan(messageContents.length);

            // Property: Most recent messages should be preserved
            const recentCount = session!.messages.length;
            for (let i = 0; i < recentCount; i++) {
              const messageIndex = i;
              const contentIndex = messageContents.length - recentCount + i;
              expect(session!.messages[messageIndex].content).toBe(messageContents[contentIndex]);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve recent messages during compaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 600, maxLength: 900 }), { minLength: 12, maxLength: 18 }),
        async (userId, sessionId, messageContents) => {
          // Create service with small threshold
          const smallService = new MemoryService({ maxContextSize: 10000 });

          // Create session
          await smallService.createSession(userId, sessionId);

          // Add all messages
          for (const content of messageContents) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await smallService.addMessage(userId, sessionId, message);
          }

          // Property: Recent messages should be fully accessible
          const messages = await smallService.getSessionMessages(userId, sessionId);
          expect(messages.length).toBeGreaterThan(0);

          // Property: Recent messages should match the last N messages added
          const recentCount = messages.length;
          for (let i = 0; i < recentCount; i++) {
            const messageIndex = i;
            const contentIndex = messageContents.length - recentCount + i;
            expect(messages[messageIndex].content).toBe(messageContents[contentIndex]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not compact when context is below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 2, maxLength: 8 }),
        async (userId, sessionId, messageContents) => {
          // Create service with large threshold
          const largeService = new MemoryService({ maxContextSize: 50000 });

          // Create session
          await largeService.createSession(userId, sessionId);

          // Add messages
          for (const content of messageContents) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await largeService.addMessage(userId, sessionId, message);
          }

          // Property: No compaction should occur
          const session = await largeService.getSession(userId, sessionId);
          expect(session?.compactedContext).toBeUndefined();

          // Property: All messages should be preserved
          expect(session?.messages.length).toBe(messageContents.length);

          // Property: All messages should match original content
          for (let i = 0; i < messageContents.length; i++) {
            expect(session?.messages[i].content).toBe(messageContents[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accumulate compacted context across multiple compactions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.tuple(
          fc.array(fc.string({ minLength: 600, maxLength: 800 }), { minLength: 10, maxLength: 15 }),
          fc.array(fc.string({ minLength: 600, maxLength: 800 }), { minLength: 10, maxLength: 15 })
        ),
        async (userId, sessionId, [batch1, batch2]) => {
          // Create service with small threshold
          const smallService = new MemoryService({ maxContextSize: 10000 });

          // Create session
          await smallService.createSession(userId, sessionId);

          // Add first batch (will trigger compaction)
          for (const content of batch1) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await smallService.addMessage(userId, sessionId, message);
          }

          // Get session after first compaction
          const sessionAfterFirst = await smallService.getSession(userId, sessionId);
          const firstCompactedContext = sessionAfterFirst?.compactedContext;

          // Add second batch (will trigger another compaction)
          for (const content of batch2) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await smallService.addMessage(userId, sessionId, message);
          }

          // Get session after second compaction
          const sessionAfterSecond = await smallService.getSession(userId, sessionId);

          // Property: If first compaction occurred, second compacted context should include it
          if (firstCompactedContext) {
            expect(sessionAfterSecond?.compactedContext).toBeDefined();
            expect(sessionAfterSecond?.compactedContext).toContain('Previous conversation summary');
          }

          // Property: Recent messages should still be accessible
          const messages = await smallService.getSessionMessages(userId, sessionId);
          expect(messages.length).toBeGreaterThan(0);
          expect(messages.length).toBeLessThan(batch1.length + batch2.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reduce total context size after compaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 700, maxLength: 900 }), { minLength: 12, maxLength: 18 }),
        async (userId, sessionId, messageContents) => {
          // Create service with small threshold
          const smallService = new MemoryService({ maxContextSize: 10000 });

          // Create session
          await smallService.createSession(userId, sessionId);

          // Calculate total size before compaction
          const totalSizeBefore = messageContents.reduce((sum, content) => sum + content.length, 0);

          // Add all messages
          for (const content of messageContents) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await smallService.addMessage(userId, sessionId, message);
          }

          // Get session after compaction
          const session = await smallService.getSession(userId, sessionId);

          // Calculate total size after compaction
          const messagesSizeAfter = session!.messages.reduce((sum, msg) => sum + msg.content.length, 0);
          const compactedSize = session?.compactedContext?.length || 0;
          const totalSizeAfter = messagesSizeAfter + compactedSize;

          // Property: If compaction occurred, total size should be reduced
          if (session?.compactedContext) {
            expect(totalSizeAfter).toBeLessThan(totalSizeBefore);

            // Property: Compacted context should be much smaller than original old messages
            const keptMessages = session.messages.length;
            const oldMessagesSize = messageContents.slice(0, -keptMessages).reduce((sum, content) => sum + content.length, 0);
            if (oldMessagesSize > 0) {
              expect(compactedSize).toBeLessThan(oldMessagesSize);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain compacted context across session retrievals', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 600, maxLength: 900 }), { minLength: 10, maxLength: 15 }),
        async (userId, sessionId, messageContents) => {
          // Create service with small threshold
          const smallService = new MemoryService({ maxContextSize: 10000 });

          // Create session and add messages
          await smallService.createSession(userId, sessionId);
          for (const content of messageContents) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await smallService.addMessage(userId, sessionId, message);
          }

          // Get session first time
          const session1 = await smallService.getSession(userId, sessionId);
          const compactedContext1 = session1?.compactedContext;

          // Get session second time
          const session2 = await smallService.getSession(userId, sessionId);
          const compactedContext2 = session2?.compactedContext;

          // Property: Compacted context should be consistent across retrievals
          expect(compactedContext1).toBe(compactedContext2);

          // Property: Message count should be consistent
          expect(session1?.messages.length).toBe(session2?.messages.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
