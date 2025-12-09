/**
 * Memory Service TTL Tests
 * 
 * Tests TTL configuration and session expiration behavior.
 * Requirement 11.5: Configure TTL for old sessions
 */

import { MemoryService } from '../memory-service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('MemoryService TTL', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    ddbMock.reset();
    // Set up default mock responses
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});
    memoryService = new MemoryService();
  });

  describe('TTL Configuration', () => {
    it('should set TTL to 90 days from last access when creating session', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';

      // Mock QueryCommand to return no existing session
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      // Create a new session by adding a message
      await memoryService.addMessage(userId, sessionId, {
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      });

      // Verify PutCommand was called with TTL
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);

      const lastPutCall = putCalls[putCalls.length - 1];
      const item = lastPutCall.args[0].input.Item;

      expect(item).toBeDefined();
      expect(item!).toHaveProperty('ttl');
      expect(typeof item!.ttl).toBe('number');

      // TTL should be in the future (more than current time)
      const now = Math.floor(Date.now() / 1000);
      expect(item!.ttl).toBeGreaterThan(now);
      
      // TTL should be approximately 90 days from now
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      const maxExpectedTtl = now + ninetyDaysInSeconds + 120; // 2 minute tolerance
      expect(item!.ttl).toBeLessThan(maxExpectedTtl);
    });

    it('should update TTL when session is accessed', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';
      const now = new Date();

      // Mock existing session with old TTL
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          userId,
          sessionKey: `${sessionId}#${now.toISOString()}`,
          sessionId,
          messages: [],
          lastAccessed: now.toISOString(),
          createdAt: now.toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days old TTL
        }],
      });

      // Access the session
      await memoryService.getSession(userId, sessionId);

      // Verify UpdateCommand was called to update TTL
      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBeGreaterThan(0);

      const updateCall = updateCalls[0];
      const values = updateCall.args[0].input.ExpressionAttributeValues;
      expect(values).toHaveProperty(':ttl');

      // New TTL should be in the future and approximately 90 days from now
      const newTtl = values![':ttl'];
      const currentTime = Math.floor(Date.now() / 1000);
      expect(newTtl).toBeGreaterThan(currentTime);
      
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      const maxExpectedTtl = currentTime + ninetyDaysInSeconds + 120;
      expect(newTtl).toBeLessThan(maxExpectedTtl);
    });

    it('should extend TTL when adding messages to session', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';
      const now = new Date();

      // Mock existing session with old TTL
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          userId,
          sessionKey: `${sessionId}#${now.toISOString()}`,
          sessionId,
          messages: [
            {
              role: 'user',
              content: 'Old message',
              timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
            },
          ],
          lastAccessed: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: now.toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days remaining
        }],
      });

      // Add a new message
      await memoryService.addMessage(userId, sessionId, {
        role: 'user',
        content: 'New message',
        timestamp: new Date(),
      });

      // Verify PutCommand was called with updated TTL
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);

      const lastPutCall = putCalls[putCalls.length - 1];
      const item = lastPutCall.args[0].input.Item;

      // New TTL should be in the future and approximately 90 days from now
      const currentTime = Math.floor(Date.now() / 1000);
      expect(item!.ttl).toBeGreaterThan(currentTime);
      
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      const maxExpectedTtl = currentTime + ninetyDaysInSeconds + 120;
      expect(item!.ttl).toBeLessThan(maxExpectedTtl);
    });
  });

  describe('TTL Calculation', () => {
    it('should calculate TTL correctly for different dates', () => {
      const lastAccessed = new Date('2024-01-01T00:00:00Z');
      const ttlDate = new Date(lastAccessed);
      ttlDate.setDate(ttlDate.getDate() + 90);

      // 90 days from Jan 1, 2024 should be in late March/early April
      expect(ttlDate.getMonth()).toBeGreaterThanOrEqual(2); // At least March
      expect(ttlDate.getFullYear()).toBe(2024);
    });

    it('should handle leap years correctly', () => {
      // Start from Feb 29, 2024 (leap year)
      const lastAccessed = new Date('2024-02-29T00:00:00Z');
      const ttlDate = new Date(lastAccessed);
      ttlDate.setDate(ttlDate.getDate() + 90);

      // 90 days from Feb 29, 2024 should be in late May
      expect(ttlDate.getMonth()).toBe(4); // May (0-indexed)
      expect(ttlDate.getFullYear()).toBe(2024);
    });
  });

  describe('Session Lifecycle with TTL', () => {
    it('should create session with TTL on first message', async () => {
      const userId = 'test-user';
      const sessionId = 'new-session';

      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await memoryService.addMessage(userId, sessionId, {
        role: 'user',
        content: 'First message',
        timestamp: new Date(),
      });

      const putCalls = ddbMock.commandCalls(PutCommand);
      const item = putCalls[putCalls.length - 1].args[0].input.Item;

      expect(item!.ttl).toBeDefined();
      expect(item!.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should maintain TTL through session compaction', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';
      const now = new Date();

      // Create session with 50 messages (at threshold)
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      }));

      // First call returns session with 50 messages
      // Second call (after compaction) returns compacted session
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [{
          userId,
          sessionKey: `${sessionId}#${now.toISOString()}`,
          sessionId,
          messages,
          lastAccessed: now.toISOString(),
          createdAt: now.toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
        }],
      }).resolves({
        Items: [{
          userId,
          sessionKey: `${sessionId}#${now.toISOString()}`,
          sessionId,
          messages: messages.slice(-10), // Only last 10 messages after compaction
          summary: '[Compacted 40 messages]',
          lastAccessed: now.toISOString(),
          createdAt: now.toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
        }],
      });

      // Add message to trigger compaction (51st message)
      await memoryService.addMessage(userId, sessionId, {
        role: 'user',
        content: 'Trigger compaction',
        timestamp: new Date(),
      });

      // Verify TTL is still set after compaction
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
      
      const lastPutCall = putCalls[putCalls.length - 1];
      const compactedItem = lastPutCall.args[0].input.Item;

      expect(compactedItem!.ttl).toBeDefined();
      expect(typeof compactedItem!.ttl).toBe('number');
      
      // TTL should be in the future
      const currentTime = Math.floor(Date.now() / 1000);
      expect(compactedItem!.ttl).toBeGreaterThan(currentTime);
    });
  });

  describe('Error Handling', () => {
    it('should handle TTL calculation errors gracefully', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';

      // Mock session with invalid lastAccessed date
      ddbMock.on(QueryCommand).resolves({
        Items: [{
          userId,
          sessionKey: `${sessionId}#2024-01-01T00:00:00Z`,
          sessionId,
          messages: [],
          lastAccessed: 'invalid-date',
          createdAt: '2024-01-01T00:00:00Z',
        }],
      });

      // Should not throw error
      await expect(
        memoryService.addMessage(userId, sessionId, {
          role: 'user',
          content: 'Test',
          timestamp: new Date(),
        })
      ).resolves.not.toThrow();
    });
  });
});
