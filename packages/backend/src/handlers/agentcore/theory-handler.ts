/**
 * Theory Agent Lambda Handler
 * 
 * Lambda function for the Theory Agent.
 * Analyzes theories with evidence gathering and profile updates.
 * 
 * Requirements: 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { Handler } from 'aws-lambda';
import { TheoryAgent } from '../../agents/theory/theory-agent';
import { logger } from '../../utils/logger';
import { UserIdentity } from '../../agents/types/identity';
import { ConversationMemory } from '../../agents/types/memory';

/**
 * Lambda event for Theory Agent invocation
 */
export interface TheoryAgentEvent {
  /**
   * User query (theory analysis request)
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
 * Lambda response from Theory Agent
 */
export interface TheoryAgentResponse {
  /**
   * Response content (theory analysis)
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
    evidenceGathered?: boolean;
    profileUpdated?: boolean;
    duration?: number;
  };
}

// Create Theory Agent instance (reused across invocations)
let theoryAgent: TheoryAgent | null = null;

/**
 * Get or create Theory Agent instance
 * 
 * Reuses the same instance across Lambda invocations for performance
 */
function getTheoryAgent(): TheoryAgent {
  if (!theoryAgent) {
    logger.info('Creating new Theory Agent instance');
    theoryAgent = new TheoryAgent();
  }
  return theoryAgent;
}

/**
 * Lambda handler for Theory Agent
 * 
 * This handler:
 * 1. Receives theory analysis request
 * 2. Invokes Query Agent to gather evidence
 * 3. Analyzes theory against evidence
 * 4. Updates theory profile
 * 5. Returns analysis
 * 
 * Environment Variables:
 * - QUERY_FUNCTION_ARN: ARN of Query Agent Lambda
 * - USER_PROFILES_TABLE: DynamoDB table for user profiles
 * - MODEL_ID: Bedrock model ID (default: amazon.nova-pro-v1:0)
 * 
 * @param event - Theory Agent event
 * @returns Theory Agent response
 */
export const handler: Handler<TheoryAgentEvent, TheoryAgentResponse> = async (
  event: TheoryAgentEvent
): Promise<TheoryAgentResponse> => {
  const startTime = Date.now();

  logger.info('Theory Agent handler invoked', {
    requestId: event.requestId,
    userId: event.identity.userId,
    queryLength: event.query.length,
  });

  try {
    // Get Theory Agent instance
    const agent = getTheoryAgent();

    // Process theory analysis request
    const result = await agent.invokeAgent({
      query: event.query,
      identity: event.identity,
      memory: event.memory,
    });

    const duration = Date.now() - startTime;

    logger.info('Theory Agent handler completed', {
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
        evidenceGathered: true,
        duration,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Theory Agent handler error', error, {
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
