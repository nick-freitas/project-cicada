import * as fc from 'fast-check';
import { Message } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 22: Session Isolation
 * Validates: Requirements 12.2
 * 
 * For any new session, it SHALL not have access to conversation context from previous sessions
 * (except through explicit memory retrieval).
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

describe('Property 22: Session Isolation', () => {
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

  it('should not have access to messages from previous sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([s1, s2]) => s1 !== s2),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        async (userId, [session1Id, session2Id], messages1, messages2) => {
          // Create first session and add messages
          await service.createSession(userId, session1Id);
          for (const content of messages1) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(userId, session1Id, message);
          }

          // Create second session and add messages
          await service.createSession(userId, session2Id);
          for (const content of messages2) {
            const message: Message = {
              role: 'assistant',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(userId, session2Id, message);
          }

          // Property: Session 1 should only have its own messages
          const session1Messages = await service.getSessionMessages(userId, session1Id);
          expect(session1Messages.length).toBe(messages1.length);
          for (let i = 0; i < messages1.length; i++) {
            expect(session1Messages[i].content).toBe(messages1[i]);
          }

          // Property: Session 2 should only have its own messages
          const session2Messages = await service.getSessionMessages(userId, session2Id);
          expect(session2Messages.length).toBe(messages2.length);
          for (let i = 0; i < messages2.length; i++) {
            expect(session2Messages[i].content).toBe(messages2[i]);
          }

          // Property: Sessions should not contain each other's messages
          const session1Contents = session1Messages.map((m) => m.content);
          const session2Contents = session2Messages.map((m) => m.content);
          
          for (const msg of messages2) {
            expect(session1Contents).not.toContain(msg);
          }
          
          for (const msg of messages1) {
            expect(session2Contents).not.toContain(msg);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain separate session state for the same user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(
          fc.tuple(
            fc.string({ minLength: 5, maxLength: 20 }),
            fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 1, maxLength: 3 })
          ),
          { minLength: 2, maxLength: 4 }
        ).filter((sessions) => {
          // Ensure all session IDs are unique
          const ids = sessions.map(([id]) => id);
          return new Set(ids).size === ids.length;
        }),
        async (userId, sessionsData) => {
          // Create multiple sessions with different messages
          for (const [sessionId, messages] of sessionsData) {
            await service.createSession(userId, sessionId);
            for (const content of messages) {
              const message: Message = {
                role: 'user',
                content,
                timestamp: new Date().toISOString(),
              };
              await service.addMessage(userId, sessionId, message);
            }
          }

          // Property: Each session should only contain its own messages
          for (let i = 0; i < sessionsData.length; i++) {
            const [sessionId, expectedMessages] = sessionsData[i];
            const actualMessages = await service.getSessionMessages(userId, sessionId);
            
            expect(actualMessages.length).toBe(expectedMessages.length);
            
            for (let j = 0; j < expectedMessages.length; j++) {
              expect(actualMessages[j].content).toBe(expectedMessages[j]);
            }

            // Property: Session should not contain messages from other sessions
            for (let k = 0; k < sessionsData.length; k++) {
              if (k !== i) {
                const [, otherMessages] = sessionsData[k];
                const actualContents = actualMessages.map((m) => m.content);
                for (const otherMsg of otherMessages) {
                  expect(actualContents).not.toContain(otherMsg);
                }
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should start new sessions with empty message history', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([oldId, newId]) => oldId !== newId),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        async (userId, [oldSessionId, newSessionId], oldMessages) => {
          // Create first session with messages
          await service.createSession(userId, oldSessionId);
          for (const content of oldMessages) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(userId, oldSessionId, message);
          }

          // Create new session
          const newSession = await service.createSession(userId, newSessionId);

          // Property: New session should start with empty messages
          expect(newSession.messages).toEqual([]);
          expect(newSession.messages.length).toBe(0);

          // Property: Getting messages from new session should return empty array
          const newSessionMessages = await service.getSessionMessages(userId, newSessionId);
          expect(newSessionMessages.length).toBe(0);

          // Property: Old session should still have its messages
          const oldSessionMessages = await service.getSessionMessages(userId, oldSessionId);
          expect(oldSessionMessages.length).toBe(oldMessages.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should isolate sessions across different users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        async ([user1, user2], sessionId, messages1, messages2) => {
          // Create sessions for both users with the same sessionId
          await service.createSession(user1, sessionId);
          await service.createSession(user2, sessionId);

          // Add different messages to each user's session
          for (const content of messages1) {
            const message: Message = {
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(user1, sessionId, message);
          }

          for (const content of messages2) {
            const message: Message = {
              role: 'assistant',
              content,
              timestamp: new Date().toISOString(),
            };
            await service.addMessage(user2, sessionId, message);
          }

          // Property: User 1's session should only have user 1's messages
          const user1Messages = await service.getSessionMessages(user1, sessionId);
          expect(user1Messages.length).toBe(messages1.length);
          for (let i = 0; i < messages1.length; i++) {
            expect(user1Messages[i].content).toBe(messages1[i]);
          }

          // Property: User 2's session should only have user 2's messages
          const user2Messages = await service.getSessionMessages(user2, sessionId);
          expect(user2Messages.length).toBe(messages2.length);
          for (let i = 0; i < messages2.length; i++) {
            expect(user2Messages[i].content).toBe(messages2[i]);
          }

          // Property: Users should not see each other's messages
          const user1Contents = user1Messages.map((m) => m.content);
          const user2Contents = user2Messages.map((m) => m.content);
          
          for (const msg of messages2) {
            expect(user1Contents).not.toContain(msg);
          }
          
          for (const msg of messages1) {
            expect(user2Contents).not.toContain(msg);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not leak session metadata between sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([s1, s2]) => s1 !== s2),
        fc.array(fc.string({ minLength: 5, maxLength: 15 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 15 }),
        async (userId, [session1Id, session2Id], episodeContext1, fragmentGroup2) => {
          // Create first session with episode context
          await service.createSession(userId, session1Id);
          const session1 = await service.getSession(userId, session1Id);
          if (session1) {
            session1.activeEpisodeContext = episodeContext1;
            await service.addMessage(userId, session1Id, {
              role: 'user',
              content: 'test',
              timestamp: new Date().toISOString(),
            });
          }

          // Create second session with fragment group
          await service.createSession(userId, session2Id);
          const session2 = await service.getSession(userId, session2Id);
          if (session2) {
            session2.activeFragmentGroup = fragmentGroup2;
            await service.addMessage(userId, session2Id, {
              role: 'user',
              content: 'test',
              timestamp: new Date().toISOString(),
            });
          }

          // Property: Session 1 should not have session 2's metadata
          const retrievedSession1 = await service.getSession(userId, session1Id);
          expect(retrievedSession1?.activeFragmentGroup).not.toBe(fragmentGroup2);

          // Property: Session 2 should not have session 1's metadata
          const retrievedSession2 = await service.getSession(userId, session2Id);
          expect(retrievedSession2?.activeEpisodeContext).not.toEqual(episodeContext1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
