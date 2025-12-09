/**
 * Query Agent Lambda Handler
 * 
 * Lambda function for the Query Agent.
 * Performs semantic search and returns cited information from the script database.
 * 
 * Requirements: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { Handler } from 'aws-lambda';
import { QueryAgent } from '../../agents/query/query-agent';
import { logger } from '../../utils/logger';
import { UserIdentity } from '../../agents/types/identity';
import { ConversationMemory } from '../../agents/types/memory';

/**
 * Lambda event for Query Agent invocation
 */
export interface QueryAgentEvent {
  /**
   * User query
   */
  query: string;

  /**
   * User identity
   */
  identity: UserIdentity;

  /**
   * Conversation memory
   */
  memory: ConversationMemory;

  /**
   * Request ID for tracking
   */
  requestId: string;
}

/**
 * Lambda response from Query Agent
 */
export interface QueryAgentResponse {
  /**
   * Response content with citations
   */
  content: string;

  /**
   * Request ID
   */
  requestId: string;

  /**
   * Whether the request was successful
   */
  success: boolean;

  /**
   * Error message if request failed
   */
  error?: string;

  /**
   * Metadata about the response
   */
  metadata?: {
    searchResultCount?: number;
    duration?: number;
  };
}

// Create Query Agent instance (reused across invocations)
let queryAgent: QueryAgent | null = null;

/**
 * Get or create Query Agent instance
 * 
 * Reuses the same instance across Lambda invocations for performance
 */
function getQueryAgent(): QueryAgent {
  if (!queryAgent) {
    logger.info('Creating new Query Agent instance');
    queryAgent = new QueryAgent();
  }
  return queryAgent;
}

/**
 * Lambda handler for Query Agent
 * 
 * This handler:
 * 1. Receives query, identity, and memory
 * 2. Invokes semantic search (ALWAYS)
 * 3. Formats results with citations
 * 4. Returns response
 * 
 * Environment Variables:
 * - KNOWLEDGE_BASE_BUCKET: S3 bucket for knowledge base embeddings
 * - MODEL_ID: Bedrock model ID (default: amazon.nova-pro-v1:0)
 * - MAX_EMBEDDINGS_TO_LOAD: Maximum embeddings to load (default: 3000)
 * 
 * @param event - Query Agent event
 * @returns Query Agent response
 */
export const handler: Handler<QueryAgentEvent, QueryAgentResponse> = async (
  event: QueryAgentEvent
): Promise<QueryAgentResponse> => {
  const startTime = Date.now();

  logger.info('Query Agent handler invoked', {
    requestId: event.requestId,
    userId: event.identity.userId,
    queryLength: event.query.length,
  });

  try {
    // Get Query Agent instance
    const agent = getQueryAgent();

    // Process query (will ALWAYS invoke semantic search)
    const result = await agent.invokeAgent({
      query: event.query,
      identity: event.identity,
      memory: event.memory,
    });

    const duration = Date.now() - startTime;

    logger.info('Query Agent handler completed', {
      requestId: event.requestId,
      userId: event.identity.userId,
      duration,
      success: true,
    });

    return {
      content: result.content,
      requestId: event.requestId,
      success: true,
      metadata: {
        ...result.metadata,
        duration,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Query Agent handler error', error, {
      requestId: event.requestId,
      userId: event.identity.userId,
      duration,
    });

    return {
      content: '',
      requestId: event.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        duration,
      },
    };
  }
};
