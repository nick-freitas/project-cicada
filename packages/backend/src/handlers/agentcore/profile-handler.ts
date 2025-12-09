/**
 * Profile Agent Lambda Handler
 * 
 * Lambda function for the Profile Agent.
 * Manages character, location, episode, and theory profiles.
 * 
 * Requirements: 1.3, 1.4, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { Handler } from 'aws-lambda';
import { ProfileAgent } from '../../agents/profile/profile-agent';
import { logger } from '../../utils/logger';
import { UserIdentity } from '../../agents/types/identity';
import { ConversationMemory } from '../../agents/types/memory';

/**
 * Lambda event for Profile Agent invocation
 */
export interface ProfileAgentEvent {
  /**
   * User query (profile operation request)
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
 * Lambda response from Profile Agent
 */
export interface ProfileAgentResponse {
  /**
   * Response content (profile data or operation result)
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
    operation?: 'GET' | 'UPDATE' | 'LIST';
    profileType?: string;
    duration?: number;
  };
}

// Create Profile Agent instance (reused across invocations)
let profileAgent: ProfileAgent | null = null;

/**
 * Get or create Profile Agent instance
 * 
 * Reuses the same instance across Lambda invocations for performance
 */
function getProfileAgent(): ProfileAgent {
  if (!profileAgent) {
    logger.info('Creating new Profile Agent instance');
    profileAgent = new ProfileAgent();
  }
  return profileAgent;
}

/**
 * Lambda handler for Profile Agent
 * 
 * This handler:
 * 1. Receives profile operation request
 * 2. Classifies operation (GET, UPDATE, LIST)
 * 3. Invokes appropriate profile service tool
 * 4. Returns result
 * 
 * Environment Variables:
 * - USER_PROFILES_TABLE: DynamoDB table for user profiles
 * - MODEL_ID: Bedrock model ID (default: amazon.nova-pro-v1:0)
 * 
 * @param event - Profile Agent event
 * @returns Profile Agent response
 */
export const handler: Handler<ProfileAgentEvent, ProfileAgentResponse> = async (
  event: ProfileAgentEvent
): Promise<ProfileAgentResponse> => {
  const startTime = Date.now();

  logger.info('Profile Agent handler invoked', {
    requestId: event.requestId,
    userId: event.identity.userId,
    queryLength: event.query.length,
  });

  try {
    // Get Profile Agent instance
    const agent = getProfileAgent();

    // Process profile operation request
    const result = await agent.invokeAgent({
      query: event.query,
      identity: event.identity,
      memory: event.memory,
    });

    const duration = Date.now() - startTime;

    logger.info('Profile Agent handler completed', {
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

    logger.error('Profile Agent handler error', error, {
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
