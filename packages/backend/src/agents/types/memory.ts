/**
 * Conversation Memory Types for AgentCore
 * 
 * Defines conversation history and session management
 * for maintaining context across agent interactions.
 */

/**
 * A single message in a conversation
 */
export interface Message {
  /**
   * Message role (user or assistant)
   */
  role: 'user' | 'assistant';

  /**
   * Message content
   */
  content: string;

  /**
   * Timestamp when message was created
   */
  timestamp: Date;

  /**
   * Optional metadata
   */
  metadata?: {
    /**
     * Agent that generated this message (for assistant messages)
     */
    agentName?: string;

    /**
     * Tools used to generate this message
     */
    toolsUsed?: string[];

    /**
     * Token usage for this message
     */
    tokenUsage?: {
      input: number;
      output: number;
    };
  };
}

/**
 * Conversation memory for a user session
 */
export interface ConversationMemory {
  /**
   * User ID who owns this conversation
   */
  userId: string;

  /**
   * Unique session identifier
   */
  sessionId: string;

  /**
   * Conversation messages
   */
  messages: Message[];

  /**
   * Optional summary of older messages (for context compaction)
   */
  summary?: string;

  /**
   * When the session was last accessed
   */
  lastAccessed: Date;

  /**
   * When the session was created
   */
  createdAt?: Date;

  /**
   * Additional session metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Options for retrieving conversation memory
 */
export interface GetMemoryOptions {
  /**
   * Maximum number of messages to retrieve
   */
  maxMessages?: number;

  /**
   * Include summary in the result
   */
  includeSummary?: boolean;
}

/**
 * Options for adding a message to memory
 */
export interface AddMessageOptions {
  /**
   * Automatically compact old messages if conversation is too long
   */
  autoCompact?: boolean;

  /**
   * Maximum messages before compaction
   */
  maxMessagesBeforeCompaction?: number;
}
