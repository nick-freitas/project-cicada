import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConversationSession, Message } from '@cicada/shared-types';
import { logger } from '../utils/logger';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONVERSATION_MEMORY_TABLE = process.env.CONVERSATION_MEMORY_TABLE || 'ConversationMemory';
const MAX_CONTEXT_SIZE = 20000; // Characters threshold for compaction
const MESSAGES_TO_KEEP_AFTER_COMPACTION = 5; // Keep only 5 most recent messages after compaction

export interface MemoryServiceConfig {
  tableName?: string;
  maxContextSize?: number;
}

export class MemoryService {
  private tableName: string;
  private maxContextSize: number;

  constructor(config?: MemoryServiceConfig) {
    this.tableName = config?.tableName || CONVERSATION_MEMORY_TABLE;
    this.maxContextSize = config?.maxContextSize || MAX_CONTEXT_SIZE;
  }

  /**
   * Create a new conversation session
   */
  async createSession(userId: string, sessionId: string): Promise<ConversationSession> {
    const now = new Date().toISOString();
    const session: ConversationSession = {
      userId,
      sessionId,
      startedAt: now,
      messages: [],
    };

    const sortKey = `${sessionId}#${now}`;

    try {
      await docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            userId,
            sessionKey: sortKey,
            sessionId,
            sessionData: session,
            startedAt: now,
          },
        })
      );

      logger.info('Session created', { userId, sessionId });
      return session;
    } catch (error) {
      logger.error('Failed to create session', { error, userId, sessionId });
      throw error;
    }
  }

  /**
   * Get a conversation session
   */
  async getSession(userId: string, sessionId: string): Promise<ConversationSession | null> {
    try {
      const result = await docClient.send(
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

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0].sessionData as ConversationSession;
    } catch (error) {
      logger.error('Failed to get session', { error, userId, sessionId });
      throw error;
    }
  }

  /**
   * Add a message to a session
   */
  async addMessage(userId: string, sessionId: string, message: Message): Promise<ConversationSession> {
    const session = await this.getSession(userId, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId} for user ${userId}`);
    }

    session.messages.push(message);

    // Check if context needs compaction
    // Only compact if we haven't just compacted (prevent re-compaction loop)
    const contextSize = this.calculateContextSize(session);
    const shouldCompact = contextSize > this.maxContextSize && session.messages.length > MESSAGES_TO_KEEP_AFTER_COMPACTION;
    
    if (shouldCompact) {
      await this.compactContext(session);
    }

    await this.updateSession(session);
    return session;
  }

  /**
   * Update a session
   */
  private async updateSession(session: ConversationSession): Promise<void> {
    const sortKey = `${session.sessionId}#${session.startedAt}`;

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            userId: session.userId,
            sessionKey: sortKey,
          },
          UpdateExpression: 'SET sessionData = :sessionData',
          ExpressionAttributeValues: {
            ':sessionData': session,
          },
        })
      );

      logger.info('Session updated', { userId: session.userId, sessionId: session.sessionId });
    } catch (error) {
      logger.error('Failed to update session', { error, userId: session.userId, sessionId: session.sessionId });
      throw error;
    }
  }

  /**
   * Get all messages from a session
   */
  async getSessionMessages(userId: string, sessionId: string): Promise<Message[]> {
    const session = await this.getSession(userId, sessionId);
    return session?.messages || [];
  }

  /**
   * List all sessions for a user
   */
  async listSessions(userId: string, limit?: number): Promise<ConversationSession[]> {
    try {
      const result = await docClient.send(
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

      return (result.Items || []).map((item) => item.sessionData as ConversationSession);
    } catch (error) {
      logger.error('Failed to list sessions', { error, userId });
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (!session) {
      return;
    }

    const sortKey = `${sessionId}#${session.startedAt}`;

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            userId,
            sessionKey: sortKey,
          },
        })
      );

      logger.info('Session deleted', { userId, sessionId });
    } catch (error) {
      logger.error('Failed to delete session', { error, userId, sessionId });
      throw error;
    }
  }

  /**
   * Calculate the total size of context in a session
   * Note: We only count active messages, not compacted context,
   * since compacted context is already summarized and shouldn't trigger more compaction
   */
  private calculateContextSize(session: ConversationSession): number {
    let size = 0;

    // Count message content
    for (const message of session.messages) {
      size += message.content.length;
    }

    // Count summary if present
    if (session.summary) {
      size += session.summary.length;
    }

    // Don't count compacted context - it's already summarized
    // and shouldn't trigger additional compaction

    return size;
  }

  /**
   * Compact older context in a session by summarizing old messages
   */
  private async compactContext(session: ConversationSession): Promise<void> {
    logger.info('Compacting context', { userId: session.userId, sessionId: session.sessionId });

    // Keep only the most recent messages to ensure we stay well below threshold
    const recentMessages = session.messages.slice(-MESSAGES_TO_KEEP_AFTER_COMPACTION);
    const oldMessages = session.messages.slice(0, -MESSAGES_TO_KEEP_AFTER_COMPACTION);

    if (oldMessages.length === 0) {
      return;
    }

    // Create a summary of old messages
    const summary = this.summarizeMessages(oldMessages);

    // Update session with compacted context
    session.compactedContext = session.compactedContext
      ? `${session.compactedContext}\n\n${summary}`
      : summary;
    session.messages = recentMessages;

    logger.info('Context compacted', {
      userId: session.userId,
      sessionId: session.sessionId,
      oldMessageCount: oldMessages.length,
      newMessageCount: recentMessages.length,
    });
  }

  /**
   * Summarize a list of messages into a compact string
   */
  private summarizeMessages(messages: Message[]): string {
    // Simple summarization: extract key topics and actions
    const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content);
    const assistantMessages = messages.filter((m) => m.role === 'assistant').map((m) => m.content);

    return `Previous conversation summary:
User discussed: ${userMessages.slice(0, 3).join('; ')}${userMessages.length > 3 ? '...' : ''}
Assistant provided: ${assistantMessages.slice(0, 3).join('; ')}${assistantMessages.length > 3 ? '...' : ''}`;
  }

  /**
   * Retrieve relevant context from previous sessions
   * This searches for sessions that might be relevant to the current query
   */
  async retrieveRelevantContext(userId: string, currentSessionId: string, query: string): Promise<string> {
    const sessions = await this.listSessions(userId, 10);

    // Filter out current session
    const previousSessions = sessions.filter((s) => s.sessionId !== currentSessionId);

    if (previousSessions.length === 0) {
      return '';
    }

    // Simple relevance: look for sessions with similar topics
    // In a real implementation, this would use embeddings and semantic search
    const relevantSessions = previousSessions.filter((session) => {
      const sessionText = session.messages.map((m) => m.content).join(' ').toLowerCase();
      const queryLower = query.toLowerCase();

      // Check if query terms appear in session
      const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 3);
      return queryTerms.some((term) => sessionText.includes(term));
    });

    if (relevantSessions.length === 0) {
      return '';
    }

    // Return summaries of relevant sessions
    return relevantSessions
      .slice(0, 3)
      .map((s) => s.summary || s.compactedContext || 'Previous discussion')
      .join('\n\n');
  }

  /**
   * Store theory information in session context
   */
  async persistTheory(userId: string, sessionId: string, theoryId: string): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId} for user ${userId}`);
    }

    // Add theory reference to session metadata
    const message: Message = {
      role: 'assistant',
      content: `Theory ${theoryId} discussed in this session`,
      timestamp: new Date().toISOString(),
      profileUpdates: [theoryId],
    };

    await this.addMessage(userId, sessionId, message);
  }
}

// Export a singleton instance
export const memoryService = new MemoryService();
