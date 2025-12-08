import { 
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { profileService } from '../../services/profile-service';
import { TheoryProfile } from '@cicada/shared-types';
import { logger } from '../../utils/logger';
import {
  invokeAgentWithRetry,
  processStreamWithErrorHandling,
} from '../../utils/agent-invocation';
import { AgentInvocationError } from '../../types/agentcore';

const bedrockAgentClient = new BedrockAgentRuntimeClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

/**
 * Theory Agent Tool Handlers
 * 
 * These handlers implement the tools available to the Theory Agent:
 * - invoke_query_agent: Invoke the Query Agent to gather evidence
 * - get_theory_profile: Retrieve an existing theory profile
 * - update_theory_profile: Update or create a theory profile
 * - get_character_profile: Retrieve character profile for context
 * 
 * Requirement 4.2: Gather evidence via Query Agent
 * Requirement 4.4: Maintain integration with Profile service
 */

export interface InvokeQueryAgentForEvidenceInput {
  query: string;
  episodeContext?: string[];
}

export interface GetTheoryProfileInput {
  userId: string;
  theoryName: string;
}

export interface UpdateTheoryProfileInput {
  userId: string;
  theoryName: string;
  theoryData: string; // JSON string containing description, status, supportingEvidence, contradictingEvidence
}

export interface GetCharacterProfileInput {
  userId: string;
  characterName: string;
}

/**
 * Tool: invoke_query_agent
 * Invokes the Query Agent to gather evidence for theory analysis
 * 
 * Requirement 4.2: Theory Agent invokes Query Agent using AgentCore's agent-to-agent invocation
 */
export async function invokeQueryAgentForEvidence(
  input: InvokeQueryAgentForEvidenceInput,
  sessionId: string
): Promise<string> {
  try {
    logger.info('Theory Agent Tool: invoke_query_agent', {
      query: input.query.substring(0, 100),
      episodeContext: input.episodeContext,
      sessionId,
    });

    const queryAgentId = process.env.QUERY_AGENT_ID;
    const queryAgentAliasId = process.env.QUERY_AGENT_ALIAS_ID;

    if (!queryAgentId || !queryAgentAliasId) {
      throw new Error('Query Agent ID or Alias ID not configured');
    }

    // Build the input text for the Query Agent
    let inputText = input.query;
    
    if (input.episodeContext && input.episodeContext.length > 0) {
      inputText += `\n\nEpisode Context: ${input.episodeContext.join(', ')}`;
    }

    // Invoke Query Agent via BedrockAgentRuntime with retry logic
    // Requirement 7.3: Implement retry logic with exponential backoff
    const response = await invokeAgentWithRetry(
      bedrockAgentClient,
      {
        agentId: queryAgentId,
        agentAliasId: queryAgentAliasId,
        sessionId: `theory-query-${sessionId}`, // Unique session for Query Agent invoked by Theory Agent
        inputText,
        enableTrace: false,
      },
      'Query',
      {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 45000,
      }
    );

    // Collect the complete response from the stream with error handling
    // Requirement 7.3: Add error handling for streaming interruptions
    if (!response.completion) {
      throw new Error('No completion stream received from Query Agent');
    }

    const completeResponse = await processStreamWithErrorHandling(
      response.completion,
      async () => {},
      async (error: Error) => {
        logger.error('Query Agent streaming error (from Theory Agent)', {
          error: error.message,
          sessionId,
        });
      }
    );

    logger.info('Query Agent invocation completed from Theory Agent', {
      responseLength: completeResponse.length,
      sessionId,
    });

    return completeResponse;
  } catch (error) {
    // Requirement 7.3: Add comprehensive error logging
    // Property 6: Error Recovery - graceful error handling
    logger.error('Error invoking Query Agent from Theory Agent', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof AgentInvocationError ? 'AgentInvocationError' : error?.constructor?.name,
      retryable: error instanceof AgentInvocationError ? error.retryable : false,
      input,
      sessionId,
    });

    // Re-throw AgentInvocationError as-is, wrap other errors
    if (error instanceof AgentInvocationError) {
      throw error;
    }

    throw new AgentInvocationError(
      `Failed to invoke Query Agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Query',
      false,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Tool: get_theory_profile
 * Retrieves an existing theory profile for the user
 * 
 * Requirement 4.4: Maintain integration with Profile service
 */
export async function getTheoryProfile(
  input: GetTheoryProfileInput
): Promise<string> {
  try {
    logger.info('Theory Agent Tool: get_theory_profile', {
      userId: input.userId,
      theoryName: input.theoryName,
    });

    const profileId = generateProfileId(input.theoryName);
    const profile = await profileService.getProfile(input.userId, 'THEORY', profileId);

    if (!profile || profile.profileType !== 'THEORY') {
      return JSON.stringify({
        found: false,
        message: 'Theory profile not found',
      });
    }

    const theoryProfile = profile as TheoryProfile;

    logger.info('Theory profile retrieved', {
      userId: input.userId,
      profileId,
      status: theoryProfile.status,
    });

    return JSON.stringify({
      found: true,
      profile: {
        theoryName: theoryProfile.theoryName,
        description: theoryProfile.description,
        status: theoryProfile.status,
        supportingEvidenceCount: theoryProfile.supportingEvidence.length,
        contradictingEvidenceCount: theoryProfile.contradictingEvidence.length,
        refinementsCount: theoryProfile.refinements.length,
        relatedTheories: theoryProfile.relatedTheories,
      },
    });
  } catch (error) {
    logger.error('Error retrieving theory profile', { error, input });
    throw new Error(`Failed to retrieve theory profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Tool: update_theory_profile
 * Updates or creates a theory profile
 * 
 * Requirement 4.4: Maintain integration with Profile service
 */
export async function updateTheoryProfile(
  input: UpdateTheoryProfileInput
): Promise<string> {
  try {
    logger.info('Theory Agent Tool: update_theory_profile', {
      userId: input.userId,
      theoryName: input.theoryName,
    });

    const profileId = generateProfileId(input.theoryName);
    const existingProfile = await profileService.getProfile(input.userId, 'THEORY', profileId);

    // Parse theory data from JSON string
    let theoryData: {
      description: string;
      status: 'proposed' | 'supported' | 'refuted' | 'refined';
      supportingEvidence: any[];
      contradictingEvidence: any[];
    };
    
    try {
      theoryData = JSON.parse(input.theoryData);
    } catch (e) {
      logger.error('Failed to parse theory data', { error: e });
      throw new Error('Invalid theory data JSON');
    }

    const { description, status, supportingEvidence, contradictingEvidence } = theoryData;

    if (existingProfile && existingProfile.profileType === 'THEORY') {
      // Update existing theory
      const existingTheory = existingProfile as TheoryProfile;
      const updated: TheoryProfile = {
        ...existingTheory,
        description,
        status,
        supportingEvidence: [
          ...existingTheory.supportingEvidence,
          ...supportingEvidence,
        ],
        contradictingEvidence: [
          ...existingTheory.contradictingEvidence,
          ...contradictingEvidence,
        ],
        updatedAt: new Date().toISOString(),
      };

      await profileService.updateProfile(updated);

      logger.info('Theory profile updated', {
        userId: input.userId,
        profileId,
        status: updated.status,
      });

      return JSON.stringify({
        success: true,
        action: 'updated',
        profileId,
        status: updated.status,
      });
    } else {
      // Create new theory
      const newTheory: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: input.userId,
        profileId,
        profileType: 'THEORY',
        theoryName: input.theoryName,
        description,
        status,
        supportingEvidence,
        contradictingEvidence,
        refinements: [],
        relatedTheories: [],
      };

      await profileService.createProfile(newTheory);

      logger.info('Theory profile created', {
        userId: input.userId,
        profileId,
        status: newTheory.status,
      });

      return JSON.stringify({
        success: true,
        action: 'created',
        profileId,
        status: newTheory.status,
      });
    }
  } catch (error) {
    logger.error('Error updating theory profile', { error, input });
    throw new Error(`Failed to update theory profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Tool: get_character_profile
 * Retrieves a character profile for context in theory analysis
 * 
 * Requirement 4.4: Maintain integration with Profile service
 */
export async function getCharacterProfile(
  input: GetCharacterProfileInput
): Promise<string> {
  try {
    logger.info('Theory Agent Tool: get_character_profile', {
      userId: input.userId,
      characterName: input.characterName,
    });

    const profileId = generateProfileId(input.characterName);
    const profile = await profileService.getProfile(input.userId, 'CHARACTER', profileId);

    if (!profile || profile.profileType !== 'CHARACTER') {
      return JSON.stringify({
        found: false,
        message: 'Character profile not found',
      });
    }

    logger.info('Character profile retrieved', {
      userId: input.userId,
      profileId,
    });

    return JSON.stringify({
      found: true,
      profile: {
        characterName: profile.characterName,
        traits: profile.traits,
        relationships: profile.relationships,
        appearances: profile.appearances,
        knownFacts: profile.knownFacts,
      },
    });
  } catch (error) {
    logger.error('Error retrieving character profile', { error, input });
    throw new Error(`Failed to retrieve character profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a profile ID from entity name
 */
function generateProfileId(entityName: string): string {
  return entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Lambda handler for Theory Agent action group
 * Routes tool invocations to the appropriate handler
 * 
 * Requirement 4.2: Implement tool handler for invoking Query Agent
 * Requirement 4.4: Implement tool handlers for Profile Service integration
 */
export async function handler(event: any): Promise<any> {
  try {
    logger.info('Theory Agent action group invoked', {
      actionGroup: event.actionGroup,
      function: event.function,
      sessionId: event.sessionId,
    });

    const functionName = event.function;
    const parameters = event.parameters || [];
    const sessionId = event.sessionId || 'default-session';

    // Convert parameters array to object
    const input: Record<string, any> = {};
    for (const param of parameters) {
      input[param.name] = param.value;
    }

    let result: any;

    switch (functionName) {
      case 'invoke_query_agent':
        result = await invokeQueryAgentForEvidence(input as InvokeQueryAgentForEvidenceInput, sessionId);
        break;

      case 'get_theory_profile':
        result = await getTheoryProfile(input as GetTheoryProfileInput);
        break;

      case 'update_theory_profile':
        result = await updateTheoryProfile(input as UpdateTheoryProfileInput);
        break;

      case 'get_character_profile':
        result = await getCharacterProfile(input as GetCharacterProfileInput);
        break;

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

    // Return response in the format expected by Bedrock Agents
    // Note: Bedrock agents require TEXT content type, not JSON
    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: functionName,
        functionResponse: {
          responseBody: {
            'TEXT': {
              body: typeof result === 'string' ? result : JSON.stringify(result),
            },
          },
        },
      },
    };
  } catch (error) {
    logger.error('Error in Theory Agent action group handler', { error, event });
    
    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseState: 'FAILURE',
          responseBody: {
            'TEXT': {
              body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          },
        },
      },
    };
  }
}
