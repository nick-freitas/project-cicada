/**
 * Unit tests for AgentCore Memory Service
 */

import { MemoryService } from '../memory-service';
import { Message } from '../../../agents/types/memory';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('MemoryService', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    ddbMock.reset();
    memoryService = new MemoryService(new DynamoDBClient({}));
  });

  describe('getSession', () => {
    it('should return existing session when found', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';
      const mockSession = {
        userId,
        sessionId,
        sessionKey: `${sessionId}#2024-01-01T00:00:00.000Z`,
        messages: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
        lastAccessed: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockSession],
      });

      ddbMock.on(UpdateCommand).resolves({});

      const result = await memoryService.getSession(userId, sessionId);

      expect(result.userId).toBe(userId);
      expect(result.sessionId).toBe(sessionId);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Hello');
    });

    it('should return new empty session when not found', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';

      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const result = await memoryService.getSession(userId, sessionId);

      expect(result.userId).toBe(userId);
      expect(result.sessionId).toBe(sessionId);
      expect(result.messages).toHaveLength(0);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should apply maxMessages option', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';
      const mockSession = {
        userId,
        sessionId,
        sessionKey: `${sessionId}#2024-01-01T00:00:00.000Z`,
        messages: [
          { role: 'user', content: 'Message 1', timestamp: new Date() },
          { role: 'assistant', content: 'Response 1', timestamp: new Date() },
          { role: 'user', content: 'Message 2', timestamp: new Date() },
          { role: 'assistant', content: 'Response 2', timestamp: new Date() },
          { role: 'user', content: 'Message 3', timestamp: new Date() },
        ],
        lastAccessed: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockSession],
      });

      ddbMock.on(UpdateCommand).resolves({});

      const result = await memoryService.getSession(userId, sessionId, {
        maxMessages: 3,
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].content).toBe('Message 2');
    });
  });

  describe('addMessage', () => {
    it('should add message to existing session', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';
      const message: Message = {
        role: 'user',
        content: 'New message',
        timestamp: new Date(),
      };

      const mockSession = {
        userId,
        sessionId,
        sessionKey: `${sessionId}#2024-01-01T00:00:00.000Z`,
        messages: [],
        lastAccessed: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockSession],
      });

      ddbMock.on(UpdateCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      await memoryService.addMessage(userId, sessionId, message);

      expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
    });
  });

  describe('listSessions', () => {
    it('should return list of sessions for user', async () => {
      const userId = 'user-123';

      const mockSessions = [
        {
          userId,
          sessionId: 'session-1',
          sessionKey: 'session-1#2024-01-01T00:00:00.000Z',
          messages: [],
          lastAccessed: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          userId,
          sessionId: 'session-2',
          sessionKey: 'session-2#2024-01-02T00:00:00.000Z',
          messages: [],
          lastAccessed: '2024-01-02T00:00:00.000Z',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockSessions,
      });

      const result = await memoryService.listSessions(userId);

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('session-1');
      expect(result[1].sessionId).toBe('session-2');
    });

    it('should return empty array when no sessions found', async () => {
      const userId = 'user-123';

      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const result = await memoryService.listSessions(userId);

      expect(result).toHaveLength(0);
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';

      const mockSession = {
        userId,
        sessionId,
        sessionKey: `${sessionId}#2024-01-01T00:00:00.000Z`,
        messages: [],
        lastAccessed: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockSession],
      });

      ddbMock.on(DeleteCommand).resolves({});

      await memoryService.deleteSession(userId, sessionId);

      expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 1);
    });

    it('should handle deletion of non-existent session', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';

      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      await memoryService.deleteSession(userId, sessionId);

      expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 0);
    });
  });

  describe('compactSession', () => {
    it('should not compact if session has few messages', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';

      const mockSession = {
        userId,
        sessionId,
        sessionKey: `${sessionId}#2024-01-01T00:00:00.000Z`,
        messages: [
          { role: 'user', content: 'Message 1', timestamp: new Date() },
          { role: 'assistant', content: 'Response 1', timestamp: new Date() },
        ],
        lastAccessed: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockSession],
      });

      ddbMock.on(UpdateCommand).resolves({});

      await memoryService.compactSession(userId, sessionId);

      // Should not save (only query and update last accessed)
      expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 0);
    });
  });
});
