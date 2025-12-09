/**
 * AgentCore Memory Service
 * 
 * Manages conversation history and context for each user session.
 * Provides session management, message persistence, context compaction,
 * and memory retrieval for agents.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../../utils/logger';
import { ConversationMemory, Message, GetMemoryOptions, AddMessageOptions } from '../../agents/types/memory';

const CONVERSATION_MEMORY_TABLE = process.env.CONVERSATION_MEMORY_TABLE || 'ConversationMemory';
const MAX_MESSAGES_BEFORE_COMPACTION = 50;
const MESSAGES_TO_KEEP_AFTER_COMPACTION = 10;

/**
 * Memory service for AgentCore
 * Handles conversation history and session management
 */
export class MemoryService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(dynamoClient?: DynamoDBClient) {
    const client = dynamoClient || new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = CONVERSATION_MEMORY_TABLE;

    logger.info('MemoryService initialized', {
      tableName: this.tableName,
    });
  }

  /**
   * Get conversation session for a user
   * 
   * Retrieves conversation history for a specific user session.
   * If the session doesn't exist, returns a new empty session.
   * 
   * Requirement 11.1: Create conversation history per user/session
   * Requirement 11.3: Provide conversation memory to agents
   * 
   * @param userId - The user's unique identifier
   * @param sessionId - The session identifier
   * @param options - Optional retrieval options
   * @returns ConversationMemory object
   */
  async getSession(
    userId: string,
    sessionId: string,
    options?: GetMemoryOptions
  ): Promise<ConversationMemory> {
    logger.info('Getting conversation session', { userId, sessionId });

    try {
      // Query for the session using partition key and sort key prefix
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'userId = :userId AND begins_with(sessionKey, :sessionId)',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':sessionId': `${sessionId}#`,
          },
          Limit: 1,
          ScanIndexForward: false, // Get most recent
        })
      );

      if (result.Items && result.Items.length > 0) {
        const item = result.Items[0];
        const memory: ConversationMemory = {
          userId: item.userId,
          sessionId: item.sessionId,
          messages: item.messages || [],
          summary: item.summary,
          lastAccessed: new Date(item.lastAccessed),
          createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          metadata: item.metadata,
        };

        // Apply options
        if (options?.maxMessages && memory.messages.length > options.maxMessages) {
          memory.messages = memory.messages.slice(-options.maxMessages);
        }

        if (options?.includeSummary === false) {
          delete memory.summary;
        }

        logger.debug('Session found', {
          userId,
          sessionId,
          messageCount: memory.messages.length,
          hasSummary: !!memory.summary,
        });

        // Update last accessed time
        await this.updateLastAccessed(userId, sessionId, item.sessionKey);

        return memory;
      }

      // Session doesn't exist, return new empty session
      logger.debug('Session not found, creating new', { userId, sessionId });
      return this.createNewSession(userId, sessionId);
    } catch (error) {
      logger.error('Error getting session', error, { userId, sessionId });
      // Return empty session on error to allow operation to continue
      return this.createNewSession(userId, sessionId);
    }
  }

  /**
   * Add a message to conversation memory
   * 
   * Appends a new message to the user's conversation history.
   * Automatically compacts old messages if conversation gets too long.
   * 
   * Requirement 11.2: Store messages in conversation memory
   * Requirement 11.4: Compact long conversations
   * 
   * @param userId - The user's unique identifier
   * @param sessionId - The session identifier
   * @param message - The message to add
   * @param options - Optional add message options
   */
  async addMessage(
    userId: string,
    sessionId: string,
    message: Message,
    options?: AddMessageOptions
  ): Promise<void> {
    logger.info('Adding message to session', {
      userId,
      sessionId,
      role: message.role,
    });

    try {
      // Get current session
      const session = await this.getSession(userId, sessionId);

      // Add new message
      session.messages.push(message);
      session.lastAccessed = new Date();

      // Check if compaction is needed
      const shouldCompact =
        options?.autoCompact !== false &&
        session.messages.length >
          (options?.maxMessagesBeforeCompaction || MAX_MESSAGES_BEFORE_COMPACTION);

      if (shouldCompact) {
        logger.info('Compacting session', {
          userId,
          sessionId,
          messageCount: session.messages.length,
        });
        await this.compactSession(userId, sessionId);
        // Re-fetch session after compaction
        const compactedSession = await this.getSession(userId, sessionId);
        compactedSession.messages.push(message);
        await this.saveSession(compactedSession);
      } else {
        // Save updated session
        await this.saveSession(session);
      }

      logger.debug('Message added successfully', {
        userId,
        sessionId,
        totalMessages: session.messages.length,
      });
    } catch (error) {
      logger.error('Error adding message', error, { userId, sessionId });
      throw new Error(`Failed to add message to session ${sessionId}`);
    }
  }

  /**
   * Compact old messages in a session
   * 
   * Summarizes older messages to reduce memory size while preserving
   * important context. Keeps only the most recent messages in full.
   * 
   * Requirement 11.4: Compact long conversations
   * 
   * @param userId - The user's unique identifier
   * @param sessionId - The session identifier
   */
  async compactSession(userId: string, sessionId: string): Promise<void> {
    logger.info('Compacting session', { userId, sessionId });

    try {
      // Get current session
      const session = await this.getSession(userId, sessionId);

      if (session.messages.length <= MESSAGES_TO_KEEP_AFTER_COMPACTION) {
        logger.debug('Session too short to compact', {
          userId,
          sessionId,
          messageCount: session.messages.length,
        });
        return;
      }

      // Split messages into old and recent
      const messagesToCompact = session.messages.slice(
        0,
        -MESSAGES_TO_KEEP_AFTER_COMPACTION
      );
      const recentMessages = session.messages.slice(-MESSAGES_TO_KEEP_AFTER_COMPACTION);

      // Create summary of old messages
      const newSummary = this.summarizeMessages(messagesToCompact);

      // Combine with existing summary if present
      const combinedSummary = session.summary
        ? `${session.summary}\n\n${newSummary}`
        : newSummary;

      // Update session
      session.messages = recentMessages;
      session.summary = combinedSummary;
      session.lastAccessed = new Date();

      // Save compacted session
      await this.saveSession(session);

      logger.info('Session compacted successfully', {
        userId,
        sessionId,
        oldMessageCount: messagesToCompact.length,
        newMessageCount: recentMessages.length,
        hasSummary: !!session.summary,
      });
    } catch (error) {
      logger.error('Error compacting session', error, { userId, sessionId });
      throw new Error(`Failed to compact session ${sessionId}`);
    }
  }

  /**
   * List all sessions for a user
   * 
   * @param userId - The user's unique identifier
   * @param limit - Maximum number of sessions to return
   * @returns Array of ConversationMemory objects
   */
  async listSessions(userId: string, limit: number = 10): Promise<ConversationMemory[]> {
    logger.info('Listing sessions for user', { userId, limit });

    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
          Limit: limit,
          ScanIndexForward: false, // Most recent first
        })
      );

      const sessions: ConversationMemory[] = (result.Items || []).map((item) => ({
        userId: item.userId,
        sessionId: item.sessionId,
        messages: item.messages || [],
        summary: item.summary,
        lastAccessed: new Date(item.lastAccessed),
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        metadata: item.metadata,
      }));

      logger.debug('Sessions retrieved', {
        userId,
        sessionCount: sessions.length,
      });

      return sessions;
    } catch (error) {
      logger.error('Error listing sessions', error, { userId });
      return [];
    }
  }

  /**
   * Delete a session
   * 
   * @param userId - The user's unique identifier
   * @param sessionId - The session identifier
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    logger.info('Deleting session', { userId, sessionId });

    try {
      // Get session to find the exact sessionKey
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'userId = :userId AND begins_with(sessionKey, :sessionId)',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':sessionId': `${sessionId}#`,
          },
          Limit: 1,
        })
      );

      if (result.Items && result.Items.length > 0) {
        const sessionKey = result.Items[0].sessionKey;

        await this.docClient.send(
          new DeleteCommand({
            TableName: this.tableName,
            Key: {
              userId,
              sessionKey,
            },
          })
        );

        logger.info('Session deleted successfully', { userId, sessionId });
      } else {
        logger.warn('Session not found for deletion', { userId, sessionId });
      }
    } catch (error) {
      logger.error('Error deleting session', error, { userId, sessionId });
      throw new Error(`Failed to delete session ${sessionId}`);
    }
  }

  /**
   * Create a new empty session
   * 
   * @param userId - The user's unique identifier
   * @param sessionId - The session identifier
   * @returns New ConversationMemory object
   */
  private createNewSession(userId: string, sessionId: string): ConversationMemory {
    const now = new Date();
    return {
      userId,
      sessionId,
      messages: [],
      lastAccessed: now,
      createdAt: now,
    };
  }

  /**
   * Save a session to DynamoDB
   * 
   * Sets TTL to 90 days from last access for automatic cleanup.
   * Requirement 11.5: Configure TTL for old sessions
   * 
   * @param session - The session to save
   */
  private async saveSession(session: ConversationMemory): Promise<void> {
    const now = new Date().toISOString();
    const sessionKey = `${session.sessionId}#${session.createdAt?.toISOString() || now}`;

    // Calculate TTL: 90 days from last access (in seconds since epoch)
    const ttlDate = new Date(session.lastAccessed);
    ttlDate.setDate(ttlDate.getDate() + 90);
    const ttl = Math.floor(ttlDate.getTime() / 1000);

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            userId: session.userId,
            sessionKey,
            sessionId: session.sessionId,
            messages: session.messages,
            summary: session.summary,
            lastAccessed: session.lastAccessed.toISOString(),
            createdAt: session.createdAt?.toISOString() || now,
            metadata: session.metadata,
            ttl, // TTL for automatic cleanup after 90 days
          },
        })
      );

      logger.debug('Session saved', {
        userId: session.userId,
        sessionId: session.sessionId,
        messageCount: session.messages.length,
        ttl: new Date(ttl * 1000).toISOString(),
      });
    } catch (error) {
      logger.error('Error saving session', error, {
        userId: session.userId,
        sessionId: session.sessionId,
      });
      throw error;
    }
  }

  /**
   * Update last accessed time for a session
   * 
   * Also updates TTL to extend session lifetime by 90 days from access.
   * Requirement 11.5: Configure TTL for old sessions
   * 
   * @param userId - The user's unique identifier
   * @param sessionId - The session identifier
   * @param sessionKey - The session's sort key
   */
  private async updateLastAccessed(
    userId: string,
    sessionId: string,
    sessionKey: string
  ): Promise<void> {
    try {
      const now = new Date();
      const ttlDate = new Date(now);
      ttlDate.setDate(ttlDate.getDate() + 90);
      const ttl = Math.floor(ttlDate.getTime() / 1000);

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            userId,
            sessionKey,
          },
          UpdateExpression: 'SET lastAccessed = :now, #ttl = :ttl',
          ExpressionAttributeNames: {
            '#ttl': 'ttl',
          },
          ExpressionAttributeValues: {
            ':now': now.toISOString(),
            ':ttl': ttl,
          },
        })
      );
    } catch (error) {
      // Non-critical error, just log it
      logger.warn('Failed to update last accessed time', {
        userId,
        sessionId,
        error,
      });
    }
  }

  /**
   * Summarize a list of messages
   * 
   * Creates a compact summary of conversation messages.
   * 
   * @param messages - Messages to summarize
   * @returns Summary string
   */
  private summarizeMessages(messages: Message[]): string {
    if (messages.length === 0) {
      return '';
    }

    // Extract key information from messages
    const userMessages = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.substring(0, 100)); // First 100 chars

    const assistantMessages = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content.substring(0, 100)); // First 100 chars

    // Create summary
    const summary = [
      `[Compacted ${messages.length} messages]`,
      userMessages.length > 0
        ? `User topics: ${userMessages.slice(0, 3).join('; ')}${userMessages.length > 3 ? '...' : ''}`
        : '',
      assistantMessages.length > 0
        ? `Assistant responses: ${assistantMessages.slice(0, 3).join('; ')}${assistantMessages.length > 3 ? '...' : ''}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    return summary;
  }
}

// Export singleton instance
export const memoryService = new MemoryService();
