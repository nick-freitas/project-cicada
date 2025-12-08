import { 
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { logger } from '../../utils/logger';
import {
  invokeAgentWithRetry,
  processStreamWithErrorHandling,
  getUserFriendlyErrorMessage,
} from '../../utils/agent-invocation';
import { AgentInvocationError } from '../../types/agentcore';

const bedrockAgentClient = new BedrockAgentRuntimeClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

/**
 * Orchestrator Agent Tool Handlers
 * 
 * These handlers implement the tools available to the Orchestrator Agent:
 * - invoke_query_agent: Invoke the Query Agent for script search and citations
 * - invoke_theory_agent: Invoke the Theory Agent for theory analysis
 * - invoke_profile_agent: Invoke the Profile Agent for knowledge extraction
 * 
 * Requirement 2.3: Implement tool handler that calls Query Agent via BedrockAgentRuntime
 * Requirement 7.2: Use agent-to-agent invocation patterns
 */

export interface InvokeQueryAgentInput {
  query: string;
  episodeContext?: string[];
  characterFocus?: string;
}

export interface InvokeTheoryAgentInput {
  theoryDescription: string;
  episodeContext?: string[];
  requestRefinement?: boolean;
}

export interface InvokeProfileAgentInput {
  conversationContext: string;
  extractionMode?: 'auto' | 'explicit';
}

/**
 * Tool: invoke_query_agent
 * Invokes the Query Agent to search script data and provide citations
 * 
 * Property 3: Agent Coordination Correctness
 * Requirement 2.3: Orchestrator invokes specialized agents
 */
export async function invokeQueryAgent(
  input: InvokeQueryAgentInput,
  sessionId: string
): Promise<string> {
  try {
    logger.info('Orchestrator Tool: invoke_query_agent', {
      query: input.query.substring(0, 100),
      episodeContext: input.episodeContext,
      characterFocus: input.characterFocus,
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
    
    if (input.characterFocus) {
      inputText += `\n\nCharacter Focus: ${input.characterFocus}`;
    }

    // Invoke Query Agent via BedrockAgentRuntime with retry logic
    // Requirement 7.3: Implement retry logic with exponential backoff
    const response = await invokeAgentWithRetry(
      bedrockAgentClient,
      {
        agentId: queryAgentId,
        agentAliasId: queryAgentAliasId,
        sessionId: `query-${sessionId}`, // Unique session for Query Agent
        inputText,
        enableTrace: false, // Disable trace for agent-to-agent calls to reduce overhead
      },
      'Query',
      {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 45000, // Shorter timeout for agent-to-agent calls
      }
    );

    // Collect the complete response from the stream with error handling
    // Requirement 7.3: Add error handling for streaming interruptions
    if (!response.completion) {
      throw new Error('No completion stream received from Query Agent');
    }

    const completeResponse = await processStreamWithErrorHandling(
      response.completion,
      async () => {}, // No per-chunk processing needed for agent-to-agent calls
      async (error: Error) => {
        logger.error('Query Agent streaming error', {
          error: error.message,
          sessionId,
        });
      }
    );

    logger.info('Query Agent invocation completed', {
      responseLength: completeResponse.length,
      sessionId,
    });

    return completeResponse;
  } catch (error) {
    // Requirement 7.3: Add comprehensive error logging
    // Property 6: Error Recovery - graceful error handling
    logger.error('Error invoking Query Agent', {
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
 * Tool: invoke_theory_agent
 * Invokes the Theory Agent to analyze theories and gather evidence
 * 
 * Property 3: Agent Coordination Correctness
 */
export async function invokeTheoryAgent(
  input: InvokeTheoryAgentInput,
  sessionId: string
): Promise<string> {
  try {
    logger.info('Orchestrator Tool: invoke_theory_agent', {
      theoryDescription: input.theoryDescription.substring(0, 100),
      episodeContext: input.episodeContext,
      requestRefinement: input.requestRefinement,
      sessionId,
    });

    const theoryAgentId = process.env.THEORY_AGENT_ID;
    const theoryAgentAliasId = process.env.THEORY_AGENT_ALIAS_ID;

    if (!theoryAgentId || !theoryAgentAliasId) {
      throw new Error('Theory Agent ID or Alias ID not configured');
    }

    // Build the input text for the Theory Agent
    let inputText = input.theoryDescription;
    
    if (input.episodeContext && input.episodeContext.length > 0) {
      inputText += `\n\nEpisode Context: ${input.episodeContext.join(', ')}`;
    }
    
    if (input.requestRefinement) {
      inputText += '\n\nPlease provide theory refinement suggestions.';
    }

    // Invoke Theory Agent via BedrockAgentRuntime with retry logic
    // Requirement 7.3: Implement retry logic with exponential backoff
    const response = await invokeAgentWithRetry(
      bedrockAgentClient,
      {
        agentId: theoryAgentId,
        agentAliasId: theoryAgentAliasId,
        sessionId: `theory-${sessionId}`,
        inputText,
        enableTrace: false,
      },
      'Theory',
      {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 45000,
      }
    );

    // Collect the complete response from the stream with error handling
    // Requirement 7.3: Add error handling for streaming interruptions
    if (!response.completion) {
      throw new Error('No completion stream received from Theory Agent');
    }

    const completeResponse = await processStreamWithErrorHandling(
      response.completion,
      async () => {},
      async (error: Error) => {
        logger.error('Theory Agent streaming error', {
          error: error.message,
          sessionId,
        });
      }
    );

    logger.info('Theory Agent invocation completed', {
      responseLength: completeResponse.length,
      sessionId,
    });

    return completeResponse;
  } catch (error) {
    // Requirement 7.3: Add comprehensive error logging
    // Property 6: Error Recovery - graceful error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Error invoking Theory Agent', {
      errorMessage,
      errorStack,
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
      `Failed to invoke Theory Agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Theory',
      false,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Tool: invoke_profile_agent
 * Invokes the Profile Agent to extract information and manage profiles
 * 
 * Property 3: Agent Coordination Correctness
 */
export async function invokeProfileAgent(
  input: InvokeProfileAgentInput,
  sessionId: string
): Promise<string> {
  try {
    logger.info('Orchestrator Tool: invoke_profile_agent', {
      contextLength: input.conversationContext.length,
      extractionMode: input.extractionMode,
      sessionId,
    });

    const profileAgentId = process.env.PROFILE_AGENT_ID;
    const profileAgentAliasId = process.env.PROFILE_AGENT_ALIAS_ID;

    if (!profileAgentId || !profileAgentAliasId) {
      throw new Error('Profile Agent ID or Alias ID not configured');
    }

    // Build the input text for the Profile Agent
    let inputText = input.conversationContext;
    
    if (input.extractionMode) {
      inputText += `\n\nExtraction Mode: ${input.extractionMode}`;
    }

    // Invoke Profile Agent via BedrockAgentRuntime with retry logic
    // Requirement 7.3: Implement retry logic with exponential backoff
    const response = await invokeAgentWithRetry(
      bedrockAgentClient,
      {
        agentId: profileAgentId,
        agentAliasId: profileAgentAliasId,
        sessionId: `profile-${sessionId}`,
        inputText,
        enableTrace: false,
      },
      'Profile',
      {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 45000,
      }
    );

    // Collect the complete response from the stream with error handling
    // Requirement 7.3: Add error handling for streaming interruptions
    if (!response.completion) {
      throw new Error('No completion stream received from Profile Agent');
    }

    const completeResponse = await processStreamWithErrorHandling(
      response.completion,
      async () => {},
      async (error: Error) => {
        logger.error('Profile Agent streaming error', {
          error: error.message,
          sessionId,
        });
      }
    );

    logger.info('Profile Agent invocation completed', {
      responseLength: completeResponse.length,
      sessionId,
    });

    return completeResponse;
  } catch (error) {
    // Requirement 7.3: Add comprehensive error logging
    // Property 6: Error Recovery - graceful error handling
    logger.error('Error invoking Profile Agent', {
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
      `Failed to invoke Profile Agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Profile',
      false,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Lambda handler for Orchestrator Agent action group
 * Routes tool invocations to the appropriate handler
 * 
 * Requirement 2.3: Implement tool handler that calls specialized agents
 */
export async function handler(event: any): Promise<any> {
  try {
    logger.info('Orchestrator Agent action group invoked', {
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
        result = await invokeQueryAgent(input as InvokeQueryAgentInput, sessionId);
        break;

      case 'invoke_theory_agent':
        result = await invokeTheoryAgent(input as InvokeTheoryAgentInput, sessionId);
        break;

      case 'invoke_profile_agent':
        result = await invokeProfileAgent(input as InvokeProfileAgentInput, sessionId);
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
    logger.error('Error in Orchestrator Agent action group handler', { error, event });
    
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
