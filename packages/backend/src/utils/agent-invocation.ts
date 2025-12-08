/**
 * Agent Invocation Utilities
 * 
 * Provides retry logic, error handling, and graceful degradation for AgentCore agent invocations.
 * 
 * Requirements:
 * - 7.3: Handle agent invocation failures gracefully with meaningful error messages
 * - Property 6: Error Recovery - graceful error handling without exposing internal details
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandInput,
  InvokeAgentCommandOutput,
  ResponseStream,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { AgentInvocationError, AgentInvocationOptions } from '../types/agentcore';
import { logger } from './logger';

/**
 * Default retry configuration
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second base delay
const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * Error codes that are retryable
 */
const RETRYABLE_ERROR_CODES = [
  'ThrottlingException',
  'ServiceUnavailableException',
  'InternalServerException',
  'TooManyRequestsException',
  'RequestTimeout',
  'NetworkingError',
];

/**
 * Error codes that are not retryable
 */
const NON_RETRYABLE_ERROR_CODES = [
  'ValidationException',
  'AccessDeniedException',
  'ResourceNotFoundException',
  'InvalidRequestException',
];

/**
 * Determine if an error is retryable
 * 
 * @param error - The error to check
 * @returns true if the error should be retried
 */
export function isRetryableError(error: any): boolean {
  // Check for AWS SDK error codes
  if (error.name && RETRYABLE_ERROR_CODES.includes(error.name)) {
    return true;
  }

  // Check for network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Check for explicit non-retryable errors
  if (error.name && NON_RETRYABLE_ERROR_CODES.includes(error.name)) {
    return false;
  }

  // Default to non-retryable for unknown errors
  return false;
}

/**
 * Calculate exponential backoff delay
 * 
 * @param attempt - The current attempt number (1-indexed)
 * @param baseDelay - The base delay in milliseconds
 * @returns The delay in milliseconds with jitter
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = DEFAULT_RETRY_DELAY): number {
  // Exponential backoff: baseDelay * 2^(attempt - 1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  
  // Add jitter (random value between 0 and 25% of the delay)
  const jitter = Math.random() * exponentialDelay * 0.25;
  
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Sleep for a specified duration
 * 
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a user-friendly error message without exposing internal details
 * 
 * Property 6: Error Recovery - provide meaningful error message without exposing internal details
 * 
 * @param error - The error to convert
 * @param agentName - The name of the agent that failed
 * @returns A user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: any, agentName: string): string {
  // Handle null/undefined errors
  if (!error) {
    return 'An error occurred processing your request. Please try again.';
  }

  // Map error types to user-friendly messages
  if (error.name === 'ValidationException') {
    return 'Your request could not be processed. Please check your input and try again.';
  }

  if (error.name === 'AccessDeniedException') {
    return 'You do not have permission to perform this action.';
  }

  if (error.name === 'ResourceNotFoundException') {
    return 'The requested resource could not be found. Please try again later.';
  }

  if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException') {
    return 'The system is currently busy. Please wait a moment and try again.';
  }

  if (error.name === 'ServiceUnavailableException' || error.name === 'InternalServerException') {
    return 'The service is temporarily unavailable. Please try again in a few moments.';
  }

  if (error.code === 'ETIMEDOUT' || error.name === 'RequestTimeout') {
    return 'Your request timed out. Please try again.';
  }

  // Generic error message for unknown errors
  return 'An error occurred processing your request. Please try again.';
}

/**
 * Invoke an agent with retry logic and exponential backoff
 * 
 * Requirements:
 * - 7.3: Implement retry logic with exponential backoff
 * - Property 6: Error Recovery
 * 
 * @param client - The BedrockAgentRuntimeClient instance
 * @param input - The agent invocation input
 * @param agentName - The name of the agent being invoked (for logging)
 * @param options - Optional retry configuration
 * @returns The agent invocation response
 * @throws AgentInvocationError if all retries fail
 */
export async function invokeAgentWithRetry(
  client: BedrockAgentRuntimeClient,
  input: InvokeAgentCommandInput,
  agentName: string,
  options: AgentInvocationOptions = {}
): Promise<InvokeAgentCommandOutput> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  let lastError: Error | undefined;
  let attempt = 0;
  const startTime = Date.now();

  // Generate trace ID for X-Ray tracing
  // Requirement 13.4: Add X-Ray tracing for agent coordination
  const traceId = process.env._X_AMZN_TRACE_ID || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  while (attempt < maxRetries) {
    attempt++;

    try {
      // Log agent invocation start with structured logging
      // Requirement 13.1: Log invocation details to CloudWatch
      logger.logAgentInvocationStart({
        agentName,
        agentId: input.agentId,
        agentAliasId: input.agentAliasId,
        sessionId: input.sessionId,
        attempt,
        maxRetries,
        traceId,
      });

      // Create command with timeout
      const command = new InvokeAgentCommand(input);

      // Invoke with timeout
      const invocationStartTime = Date.now();
      const response = await Promise.race([
        client.send(command),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        ),
      ]);
      const duration = Date.now() - invocationStartTime;

      // Log successful invocation with metrics
      // Requirement 13.1, 13.2: Log invocation details and emit metrics
      logger.logAgentInvocationSuccess({
        agentName,
        agentId: input.agentId,
        agentAliasId: input.agentAliasId,
        sessionId: input.sessionId,
        attempt,
        duration,
        traceId,
      });

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      logger.warn('Agent invocation failed', {
        agentName,
        agentId: input.agentId,
        attempt,
        maxRetries,
        error: lastError.message,
        errorName: (error as any).name,
        retryable: isRetryableError(error),
        duration,
        traceId,
      });

      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Log non-retryable error with structured logging
        // Requirement 13.3: Log detailed error information
        logger.logAgentInvocationFailure(
          {
            agentName,
            agentId: input.agentId,
            agentAliasId: input.agentAliasId,
            sessionId: input.sessionId,
            attempt,
            duration,
            errorName: (error as any).name,
            errorCode: (error as any).code,
            retryable: false,
            traceId,
          },
          lastError
        );

        throw new AgentInvocationError(
          `Agent invocation failed: ${lastError.message}`,
          agentName,
          false,
          lastError
        );
      }

      // If this was the last attempt, throw error
      if (attempt >= maxRetries) {
        // Log max retries exceeded with structured logging
        logger.logAgentInvocationFailure(
          {
            agentName,
            agentId: input.agentId,
            agentAliasId: input.agentAliasId,
            sessionId: input.sessionId,
            attempt,
            maxRetries,
            duration,
            errorName: (error as any).name,
            errorCode: (error as any).code,
            retryable: true,
            traceId,
          },
          lastError
        );

        throw new AgentInvocationError(
          `Agent invocation failed after ${attempt} attempts: ${lastError.message}`,
          agentName,
          true,
          lastError
        );
      }

      // Calculate backoff delay and wait
      const delay = calculateBackoffDelay(attempt, retryDelay);
      logger.info('Retrying agent invocation', {
        agentName,
        agentId: input.agentId,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: delay,
        traceId,
      });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new AgentInvocationError(
    `Agent invocation failed after ${attempt} attempts`,
    agentName,
    true,
    lastError
  );
}

/**
 * Process a streaming response with error handling
 * 
 * Requirements:
 * - 7.3: Add error handling for streaming interruptions
 * - Property 6: Error Recovery
 * 
 * @param completion - The async iterable completion stream
 * @param onChunk - Callback for each chunk
 * @param onError - Callback for errors
 * @returns The complete response text
 */
export async function processStreamWithErrorHandling(
  completion: AsyncIterable<ResponseStream>,
  onChunk: (text: string) => Promise<void>,
  onError?: (error: Error) => Promise<void>,
  agentName?: string
): Promise<string> {
  let fullResponse = '';
  let chunkCount = 0;
  const startTime = Date.now();

  // Generate trace ID for X-Ray tracing
  const traceId = process.env._X_AMZN_TRACE_ID || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Log stream start
    // Requirement 13.1: Log invocation details to CloudWatch
    logger.logStreamingEvent('stream_start', {
      agentName,
      traceId,
    });

    for await (const event of completion) {
      // Handle chunk events
      if (event.chunk?.bytes) {
        const chunkText = new TextDecoder().decode(event.chunk.bytes);
        fullResponse += chunkText;
        chunkCount++;

        // Log chunk received
        logger.logStreamingEvent('stream_chunk', {
          agentName,
          chunkNumber: chunkCount,
          chunkSize: chunkText.length,
          traceId,
        });

        try {
          await onChunk(chunkText);
        } catch (chunkError) {
          logger.error('Error processing chunk', chunkError, {
            agentName,
            chunkNumber: chunkCount,
            traceId,
          });
          // Continue processing other chunks even if one fails
        }
      }

      // Handle trace events
      // Requirement 13.4: Trace the flow of requests across agents
      if (event.trace) {
        logger.debug('Agent trace event', {
          agentName,
          trace: event.trace,
          traceId,
        });
      }

      // Handle return control events
      if (event.returnControl) {
        logger.debug('Agent return control event', {
          agentName,
          invocationId: event.returnControl.invocationId,
          traceId,
        });
      }
    }

    const duration = Date.now() - startTime;

    // Log stream completion
    logger.logStreamingEvent('stream_complete', {
      agentName,
      chunkCount,
      responseLength: fullResponse.length,
      duration,
      traceId,
    });

    return fullResponse;
  } catch (error) {
    const streamError = error instanceof Error ? error : new Error(String(error));
    const duration = Date.now() - startTime;
    
    // Log stream error with structured logging
    // Requirement 13.3: Log detailed error information
    logger.logStreamingEvent('stream_error', {
      agentName,
      error: streamError.message,
      chunkCount,
      partialResponseLength: fullResponse.length,
      duration,
      traceId,
    });

    // Call error handler if provided
    if (onError) {
      try {
        await onError(streamError);
      } catch (handlerError) {
        logger.error('Error in error handler', handlerError, {
          agentName,
          traceId,
        });
      }
    }

    // Throw a wrapped error
    throw new Error(`Stream interrupted after ${chunkCount} chunks: ${streamError.message}`);
  }
}

/**
 * Graceful degradation wrapper for agent invocations
 * 
 * If the agent invocation fails, this function can return a fallback response
 * instead of throwing an error.
 * 
 * Requirements:
 * - 7.3: Implement graceful degradation for agent failures
 * 
 * @param invocation - The agent invocation function
 * @param fallback - Optional fallback response if invocation fails
 * @returns The invocation result or fallback
 */
export async function invokeWithGracefulDegradation<T>(
  invocation: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await invocation();
  } catch (error) {
    logger.warn('Agent invocation failed, using graceful degradation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      hasFallback: fallback !== undefined,
    });

    return fallback;
  }
}
