/**
 * Orchestrator Lambda Handler
 * 
 * Lambda function for the Orchestrator Agent.
 * Routes queries to specialized agents based on explicit classification logic.
 * 
 * Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { Handler } from 'aws-lambda';
import { OrchestratorAgent } from '../../agents/orchestrator/orchestrator-agent';
import { logger } from '../../utils/logger';
import { UserIdentity } from '../../agents/types/identity';
import { ConversationMemory } from '../../agents/types/memory';

/**
 * Lambda event for Orchestrator invocation
 */
export interface OrchestratorEvent {
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
 * Lambda response from Orchestrator
 */
export interface OrchestratorResponse {
  /**
   * Response content
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
    agentInvoked?: string;
    duration?: number;
  };
}

// Create Orchestrator instance (reused across invocations)
let orchestrator: OrchestratorAgent | null = null;

/**
 * Get or create Orchestrator instance
 * 
 * Reuses the same instance across Lambda invocations for performance
 */
function getOrchestrator(): OrchestratorAgent {
  if (!orchestrator) {
    logger.info('Creating new Orchestrator instance');
    orchestrator = new OrchestratorAgent();
  }
  return orchestrator;
}

/**
 * Lambda handler for Orchestrator Agent
 * 
 * This handler:
 * 1. Receives query, identity, and memory from Gateway
 * 2. Classifies the query using explicit logic
 * 3. Routes to appropriate specialized agent
 * 4. Returns response
 * 
 * Environment Variables:
 * - QUERY_FUNCTION_ARN: ARN of Query Agent Lambda
 * - THEORY_FUNCTION_ARN: ARN of Theory Agent Lambda
 * - PROFILE_FUNCTION_ARN: ARN of Profile Agent Lambda
 * - MODEL_ID: Bedrock model ID (default: amazon.nova-pro-v1:0)
 * 
 * @param event - Orchestrator event
 * @returns Orchestrator response
 */
export const handler: Handler<OrchestratorEvent, OrchestratorResponse> = async (
  event: OrchestratorEvent
): Promise<OrchestratorResponse> => {
  const startTime = Date.now();

  logger.info('Orchestrator handler invoked', {
    requestId: event.requestId,
    userId: event.identity.userId,
    queryLength: event.query.length,
  });

  try {
    // Get Orchestrator instance
    const orchestratorAgent = getOrchestrator();

    // Process query
    const result = await orchestratorAgent.invokeAgent({
      query: event.query,
      identity: event.identity,
      memory: event.memory,
    });

    const duration = Date.now() - startTime;

    logger.info('Orchestrator handler completed', {
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

    logger.error('Orchestrator handler error', error, {
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
