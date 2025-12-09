/**
 * AgentCore Gateway
 * 
 * Entry point for all agent requests. Handles routing, session management,
 * identity extraction, policy enforcement, and WebSocket streaming.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { identityService, UserIdentity } from './identity-service';
import { policyService, AgentPolicy } from './policy-service';
import { memoryService } from './memory-service';
import { logger } from '../../utils/logger';
import { WebSocketResponse } from '@cicada/shared-types';
import { ConversationMemory, Message } from '../../agents/types/memory';

// Initialize Lambda client for invoking Orchestrator
const lambdaClient = new LambdaClient({});

/**
 * Gateway request parameters
 */
export interface GatewayRequest {
  /**
   * User query or message
   */
  query: string;

  /**
   * User identifier
   */
  userId: string;

  /**
   * Session identifier for conversation continuity
   */
  sessionId: string;

  /**
   * WebSocket connection ID for streaming responses
   */
  connectionId: string;

  /**
   * Request ID for tracking
   */
  requestId: string;

  /**
   * Optional JWT token for authentication
   */
  token?: string;

  /**
   * Optional agent name to invoke directly (bypasses orchestrator)
   */
  agentName?: string;
}

/**
 * Gateway response
 */
export interface GatewayResponse {
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
    agentName?: string;
    duration?: number;
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };
  };
}

/**
 * Streaming callback function
 */
export type StreamCallback = (chunk: string) => Promise<void>;

/**
 * AgentCore Gateway
 * 
 * Central entry point that coordinates all AgentCore components:
 * - Identity extraction and validation
 * - Policy enforcement and rate limiting
 * - Memory management
 * - Agent invocation
 * - WebSocket streaming
 * - Error handling and retry logic
 */
export class Gateway {
  constructor() {
    logger.info('Gateway initialized');
  }

  /**
   * Handle an incoming request
   * 
   * This is the main entry point for all agent requests. It:
   * 1. Extracts and validates user identity
   * 2. Loads and enforces policy
   * 3. Loads conversation memory
   * 4. Invokes the appropriate agent
   * 5. Streams the response via WebSocket
   * 6. Updates conversation memory
   * 
   * Requirements:
   * - 8.1: Route requests to appropriate agent
   * - 8.2: Manage WebSocket streaming
   * - 8.3: Integrate Identity, Policy, and Memory services
   * - 8.4: Handle errors gracefully
   * - 8.5: Implement retry logic
   * 
   * @param request - Gateway request parameters
   * @param streamCallback - Callback for streaming response chunks
   * @returns Gateway response
   */
  async handleRequest(
    request: GatewayRequest,
    streamCallback?: StreamCallback
  ): Promise<GatewayResponse> {
    const startTime = Date.now();

    logger.info('Gateway handling request', {
      requestId: request.requestId,
      userId: request.userId,
      sessionId: request.sessionId,
      queryLength: request.query.length,
    });

    try {
      // Step 1: Extract and validate identity (Requirement 8.3)
      const identity = await this.extractIdentity(request);

      // Step 2: Load and enforce policy (Requirement 8.3)
      const policy = await policyService.getPolicy(identity.userId);
      const policyResult = await policyService.enforcePolicy(policy, {
        userId: identity.userId,
        agentName: request.agentName,
      });

      if (!policyResult.allowed) {
        logger.warn('Policy enforcement failed', {
          requestId: request.requestId,
          userId: identity.userId,
          reason: policyResult.reason,
        });

        return this.createErrorResponse(
          request.requestId,
          policyResult.reason || 'Request not allowed by policy',
          startTime
        );
      }

      // Step 3: Load conversation memory (Requirement 8.3)
      const memory = await memoryService.getSession(identity.userId, request.sessionId);

      logger.debug('Context loaded', {
        requestId: request.requestId,
        userId: identity.userId,
        messageCount: memory.messages.length,
        hasSummary: !!memory.summary,
        remainingRequests: policyResult.remainingRequests,
      });

      // Step 4: Invoke agent (Requirement 8.1)
      // TODO: This will be implemented when Orchestrator is ready
      // For now, return a placeholder response
      const agentResponse = await this.invokeAgent(
        request.agentName || 'orchestrator',
        request.query,
        identity,
        memory,
        policy,
        streamCallback
      );

      // Step 5: Update conversation memory
      await this.updateMemory(identity.userId, request.sessionId, request.query, agentResponse);

      const duration = Date.now() - startTime;

      logger.info('Gateway request completed', {
        requestId: request.requestId,
        userId: identity.userId,
        duration,
        success: true,
      });

      return {
        content: agentResponse,
        requestId: request.requestId,
        success: true,
        metadata: {
          agentName: request.agentName || 'orchestrator',
          duration,
        },
      };
    } catch (error) {
      // Requirement 8.4: Handle errors gracefully
      logger.error('Gateway request failed', error, {
        requestId: request.requestId,
        userId: request.userId,
        duration: Date.now() - startTime,
      });

      return this.createErrorResponse(
        request.requestId,
        this.getUserFriendlyErrorMessage(error, true), // Preserve retryable info
        startTime
      );
    }
  }

  /**
   * Extract and validate user identity
   * 
   * Requirement 8.3: Integrate Identity service
   * 
   * @param request - Gateway request
   * @returns UserIdentity
   * @throws Error if identity is invalid
   */
  private async extractIdentity(request: GatewayRequest): Promise<UserIdentity> {
    logger.debug('Extracting user identity', {
      requestId: request.requestId,
      userId: request.userId,
      hasToken: !!request.token,
    });

    let identity: UserIdentity;

    // If token provided, extract identity from token
    if (request.token) {
      identity = await identityService.getUserIdentityFromToken(request.token);
    } else {
      // Otherwise, get identity from userId
      identity = await identityService.getUserIdentity(request.userId);
    }

    // Validate identity
    const isValid = await identityService.validateIdentity(identity);
    if (!isValid) {
      throw new Error('Invalid user identity');
    }

    logger.debug('Identity validated', {
      requestId: request.requestId,
      userId: identity.userId,
      username: identity.username,
    });

    return identity;
  }

  /**
   * Invoke an agent
   * 
   * Requirement 8.1: Route to appropriate agent
   * Requirement 8.2: Stream responses via WebSocket
   * 
   * @param agentName - Name of agent to invoke
   * @param query - User query
   * @param identity - User identity
   * @param memory - Conversation memory
   * @param policy - User policy
   * @param streamCallback - Callback for streaming chunks
   * @returns Agent response
   */
  private async invokeAgent(
    agentName: string,
    query: string,
    identity: UserIdentity,
    memory: ConversationMemory,
    policy: AgentPolicy,
    streamCallback?: StreamCallback
  ): Promise<string> {
    logger.info('Invoking agent', {
      agentName,
      userId: identity.userId,
      queryLength: query.length,
      messageCount: memory.messages.length,
    });

    // Get Orchestrator function ARN from environment
    const orchestratorFunctionArn = process.env.ORCHESTRATOR_FUNCTION_ARN;
    
    if (!orchestratorFunctionArn) {
      logger.error('ORCHESTRATOR_FUNCTION_ARN environment variable not set');
      throw new Error('Orchestrator function not configured');
    }

    try {
      // Prepare invocation payload for Orchestrator
      const invocationPayload = {
        query,
        identity,
        memory,
        context: {
          agentName,
          policy,
        },
      };

      logger.debug('Invoking Orchestrator Lambda', {
        functionArn: orchestratorFunctionArn,
        userId: identity.userId,
        queryLength: query.length,
      });

      // Invoke Orchestrator Lambda
      const invokeCommand = new InvokeCommand({
        FunctionName: orchestratorFunctionArn,
        InvocationType: 'RequestResponse', // Synchronous invocation
        Payload: JSON.stringify(invocationPayload),
      });

      const lambdaResponse = await lambdaClient.send(invokeCommand);

      // Check for Lambda execution errors
      if (lambdaResponse.FunctionError) {
        logger.error('Orchestrator Lambda execution error', {
          functionError: lambdaResponse.FunctionError,
          userId: identity.userId,
        });
        throw new Error(`Orchestrator execution failed: ${lambdaResponse.FunctionError}`);
      }

      // Parse Lambda response
      if (!lambdaResponse.Payload) {
        logger.error('No payload received from Orchestrator Lambda', {
          userId: identity.userId,
        });
        throw new Error('No response from Orchestrator');
      }

      const payloadString = new TextDecoder().decode(lambdaResponse.Payload);
      const orchestratorResponse = JSON.parse(payloadString);

      logger.debug('Orchestrator Lambda response received', {
        userId: identity.userId,
        hasContent: !!orchestratorResponse.content,
        contentLength: orchestratorResponse.content?.length || 0,
      });

      // Extract response content
      const response = orchestratorResponse.content || '';

      if (!response) {
        logger.warn('Orchestrator returned empty response', {
          userId: identity.userId,
        });
        throw new Error('Empty response from Orchestrator');
      }

      // Stream response if callback provided (Requirement 8.2)
      if (streamCallback) {
        // Simulate streaming by chunking the response
        const chunkSize = 50;
        for (let i = 0; i < response.length; i += chunkSize) {
          const chunk = response.substring(i, i + chunkSize);
          await streamCallback(chunk);
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      logger.info('Agent invocation completed', {
        agentName,
        userId: identity.userId,
        responseLength: response.length,
        metadata: orchestratorResponse.metadata,
      });

      return response;
    } catch (error) {
      logger.error('Failed to invoke agent', error, {
        agentName,
        userId: identity.userId,
      });

      // Re-throw with user-friendly message
      if (error instanceof Error) {
        throw new Error(`Failed to process your request: ${error.message}`);
      }
      throw new Error('Failed to process your request');
    }
  }

  /**
   * Update conversation memory with new messages
   * 
   * Requirement 8.3: Integrate Memory service
   * 
   * @param userId - User ID
   * @param sessionId - Session ID
   * @param userQuery - User's query
   * @param agentResponse - Agent's response
   */
  private async updateMemory(
    userId: string,
    sessionId: string,
    userQuery: string,
    agentResponse: string
  ): Promise<void> {
    logger.debug('Updating conversation memory', {
      userId,
      sessionId,
      queryLength: userQuery.length,
      responseLength: agentResponse.length,
    });

    try {
      // Add user message
      const userMessage: Message = {
        role: 'user',
        content: userQuery,
        timestamp: new Date(),
      };
      await memoryService.addMessage(userId, sessionId, userMessage);

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: agentResponse,
        timestamp: new Date(),
        metadata: {
          agentName: 'gateway', // Will be updated when actual agents are invoked
        },
      };
      await memoryService.addMessage(userId, sessionId, assistantMessage);

      logger.debug('Memory updated successfully', {
        userId,
        sessionId,
      });
    } catch (error) {
      // Log error but don't fail the request
      logger.error('Failed to update memory', error, {
        userId,
        sessionId,
      });
    }
  }

  /**
   * Create an error response
   * 
   * Requirement 8.4: Return user-friendly error messages
   * 
   * @param requestId - Request ID
   * @param errorMessage - Error message
   * @param startTime - Request start time
   * @returns Gateway error response
   */
  private createErrorResponse(
    requestId: string,
    errorMessage: string,
    startTime: number
  ): GatewayResponse {
    return {
      content: '',
      requestId,
      success: false,
      error: errorMessage,
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Convert technical errors to user-friendly messages
   * 
   * Requirement 8.4: Return user-friendly error messages
   * 
   * @param error - Error object
   * @param preserveRetryableInfo - If true, append retry hint for retryable errors
   * @returns User-friendly error message
   */
  private getUserFriendlyErrorMessage(error: unknown, preserveRetryableInfo: boolean = false): string {
    if (error instanceof Error) {
      const isRetryable = this.isRetryableError(error.message);
      
      // Map specific error types to user-friendly messages
      if (error.message.includes('Rate limit exceeded')) {
        return 'You have exceeded your request limit. Please try again later.';
      }
      if (error.message.includes('Invalid or expired token')) {
        return 'Your session has expired. Please log in again.';
      }
      if (error.message.includes('Invalid user identity')) {
        return 'Authentication failed. Please log in again.';
      }
      if (error.message.includes('not permitted')) {
        return 'You do not have permission to perform this action.';
      }
      if (error.message.includes('Cannot access data belonging to other users')) {
        return 'You can only access your own data.';
      }

      // Generic error message
      const baseMessage = 'An error occurred while processing your request. Please try again.';
      
      // If preserving retryable info and error is retryable, append a marker
      if (preserveRetryableInfo && isRetryable) {
        return `${baseMessage} [retryable]`;
      }
      
      return baseMessage;
    }

    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * Handle request with retry logic
   * 
   * Requirement 8.5: Implement retry logic
   * 
   * @param request - Gateway request
   * @param streamCallback - Callback for streaming chunks
   * @param maxRetries - Maximum number of retries
   * @returns Gateway response
   */
  async handleRequestWithRetry(
    request: GatewayRequest,
    streamCallback?: StreamCallback,
    maxRetries: number = 2
  ): Promise<GatewayResponse> {
    let lastError: Error | undefined;
    let lastResponse: GatewayResponse | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.info('Attempting request', {
          requestId: request.requestId,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        const response = await this.handleRequest(request, streamCallback);

        // If successful, return immediately
        if (response.success) {
          if (attempt > 0) {
            logger.info('Request succeeded after retry', {
              requestId: request.requestId,
              attempt: attempt + 1,
            });
          }
          return response;
        }

        // Store response for potential return
        lastResponse = response;

        // If error is not retryable, return immediately
        if (response.error && !this.isRetryableError(response.error)) {
          logger.info('Error is not retryable', {
            requestId: request.requestId,
            error: response.error,
          });
          return response;
        }

        // Create error for retry logic
        lastError = new Error(response.error);

        // If last attempt, break
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.debug('Waiting before retry', {
          requestId: request.requestId,
          delay,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('Request attempt failed', {
          requestId: request.requestId,
          attempt: attempt + 1,
          error: lastError.message,
        });

        // If not retryable or last attempt, break
        if (!this.isRetryableError(lastError.message) || attempt === maxRetries) {
          break;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.debug('Waiting before retry', {
          requestId: request.requestId,
          delay,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries failed
    logger.error('All retry attempts failed', lastError, {
      requestId: request.requestId,
      maxRetries,
    });

    // Return last response if available, otherwise create error response
    if (lastResponse) {
      return lastResponse;
    }

    return this.createErrorResponse(
      request.requestId,
      this.getUserFriendlyErrorMessage(lastError),
      Date.now()
    );
  }

  /**
   * Check if an error is retryable
   * 
   * @param errorMessage - Error message
   * @returns true if error is retryable
   */
  private isRetryableError(errorMessage: string): boolean {
    const retryablePatterns = [
      'timeout',
      'throttl',
      'rate limit',
      'service unavailable',
      'internal server error',
      'connection',
      'network',
      '[retryable]', // Marker added by getUserFriendlyErrorMessage
    ];

    const lowerMessage = errorMessage.toLowerCase();
    return retryablePatterns.some(pattern => lowerMessage.includes(pattern));
  }

  /**
   * Create WebSocket response for streaming
   * 
   * Requirement 8.2: WebSocket streaming support
   * Requirement 12.2: Use existing WebSocketResponse format
   * 
   * @param requestId - Request ID
   * @param type - Response type
   * @param content - Response content
   * @param error - Error message
   * @returns WebSocketResponse
   */
  createWebSocketResponse(
    requestId: string,
    type: 'chunk' | 'complete' | 'error',
    content?: string,
    error?: string
  ): WebSocketResponse {
    return {
      requestId,
      type,
      content,
      error,
    };
  }
}

// Export singleton instance
export const gateway = new Gateway();
