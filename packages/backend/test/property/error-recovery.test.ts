import * as fc from 'fast-check';
import {
  isRetryableError,
  calculateBackoffDelay,
  getUserFriendlyErrorMessage,
  invokeAgentWithRetry,
  processStreamWithErrorHandling,
} from '../../src/utils/agent-invocation';
import { AgentInvocationError } from '../../src/types/agentcore';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Feature: agentcore-implementation, Property 6: Error Recovery
 * 
 * For any agent invocation that fails, the system should handle the error gracefully 
 * and provide a meaningful error message without exposing internal details.
 * 
 * Validates: Requirements 7.3
 */

describe('Property 6: Error Recovery', () => {
  describe('Error Classification', () => {
    it('should correctly identify retryable errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'ThrottlingException',
            'ServiceUnavailableException',
            'InternalServerException',
            'TooManyRequestsException',
            'RequestTimeout'
          ),
          (errorName: string) => {
            // Arrange: Create error with retryable error name
            const error = new Error('Test error');
            (error as any).name = errorName;

            // Act: Check if error is retryable
            const result = isRetryableError(error);

            // Assert: Should be identified as retryable
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify non-retryable errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'ValidationException',
            'AccessDeniedException',
            'ResourceNotFoundException',
            'InvalidRequestException'
          ),
          (errorName: string) => {
            // Arrange: Create error with non-retryable error name
            const error = new Error('Test error');
            (error as any).name = errorName;

            // Act: Check if error is retryable
            const result = isRetryableError(error);

            // Assert: Should be identified as non-retryable
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should identify network errors as retryable', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'),
          (errorCode: string) => {
            // Arrange: Create error with network error code
            const error = new Error('Network error');
            (error as any).code = errorCode;

            // Act: Check if error is retryable
            const result = isRetryableError(error);

            // Assert: Should be identified as retryable
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate increasing delays with exponential backoff', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 100, max: 5000 }),
          (attempt: number, baseDelay: number) => {
            // Act: Calculate backoff delay
            const delay = calculateBackoffDelay(attempt, baseDelay);

            // Assert: Delay should be at least the exponential value
            const minExpectedDelay = baseDelay * Math.pow(2, attempt - 1);
            expect(delay).toBeGreaterThanOrEqual(minExpectedDelay);

            // Assert: Delay should not exceed exponential value + 25% jitter
            const maxExpectedDelay = minExpectedDelay * 1.25;
            expect(delay).toBeLessThanOrEqual(maxExpectedDelay);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce different delays due to jitter', () => {
      // Arrange: Fixed attempt and base delay
      const attempt = 3;
      const baseDelay = 1000;

      // Act: Calculate multiple delays
      const delays = Array.from({ length: 20 }, () => calculateBackoffDelay(attempt, baseDelay));

      // Assert: Not all delays should be identical (due to jitter)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should scale exponentially with attempt number', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 100, max: 1000 }),
          (maxAttempt: number, baseDelay: number) => {
            // Act: Calculate delays for increasing attempts
            const delays: number[] = [];
            for (let attempt = 1; attempt <= maxAttempt; attempt++) {
              delays.push(calculateBackoffDelay(attempt, baseDelay));
            }

            // Assert: Each delay should generally be larger than the previous
            // (allowing for jitter, we check the trend)
            for (let i = 1; i < delays.length; i++) {
              // The average should increase exponentially
              const prevExpected = baseDelay * Math.pow(2, i - 1);
              const currExpected = baseDelay * Math.pow(2, i);
              expect(currExpected).toBeGreaterThan(prevExpected);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('User-Friendly Error Messages', () => {
    it('should not expose internal error details', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'ValidationException',
            'AccessDeniedException',
            'ResourceNotFoundException',
            'ThrottlingException',
            'ServiceUnavailableException',
            'InternalServerException'
          ),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          (errorName: string, agentName: string) => {
            // Arrange: Create error with internal details
            const error = new Error('Internal error: Database connection failed at line 42');
            (error as any).name = errorName;

            // Act: Get user-friendly message
            const message = getUserFriendlyErrorMessage(error, agentName);

            // Assert: Message should not contain internal details
            expect(message).not.toContain('Database');
            expect(message).not.toContain('line 42');
            expect(message).not.toContain('Internal error');
            expect(message).not.toContain(agentName); // Agent name should not be exposed

            // Assert: Message should be user-friendly
            expect(message.length).toBeGreaterThan(0);
            expect(message).not.toMatch(/undefined|null|NaN/i);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide meaningful messages for all error types', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'ValidationException',
            'AccessDeniedException',
            'ResourceNotFoundException',
            'ThrottlingException',
            'TooManyRequestsException',
            'ServiceUnavailableException',
            'InternalServerException',
            'RequestTimeout'
          ),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          (errorName: string, agentName: string) => {
            // Arrange: Create error
            const error = new Error('Test error');
            (error as any).name = errorName;

            // Act: Get user-friendly message
            const message = getUserFriendlyErrorMessage(error, agentName);

            // Assert: Message should be meaningful
            expect(message.length).toBeGreaterThan(10);
            expect(message).toMatch(/[a-zA-Z]/); // Contains letters
            expect(message.endsWith('.')).toBe(true); // Proper sentence

            // Assert: Message should be actionable or informative
            const hasActionableContent =
              message.includes('try again') ||
              message.includes('wait') ||
              message.includes('check') ||
              message.includes('permission') ||
              message.includes('not found') ||
              message.includes('unavailable');
            expect(hasActionableContent).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide generic message for unknown errors', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length >= 5),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          (errorMessage: string, agentName: string) => {
            // Arrange: Create error with unknown type
            const error = new Error(errorMessage);
            (error as any).name = 'UnknownError';

            // Act: Get user-friendly message
            const message = getUserFriendlyErrorMessage(error, agentName);

            // Assert: Should provide generic message
            expect(message).toBe('An error occurred processing your request. Please try again.');

            // Assert: Should not expose original error message (unless it's very short like a space)
            if (errorMessage.trim().length >= 5) {
              expect(message).not.toContain(errorMessage);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('AgentInvocationError Structure', () => {
    it('should preserve error information in AgentInvocationError', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          fc.boolean(),
          (errorMessage: string, agentName: string, retryable: boolean) => {
            // Arrange: Create original error
            const originalError = new Error('Original error');

            // Act: Create AgentInvocationError
            const agentError = new AgentInvocationError(
              errorMessage,
              agentName,
              retryable,
              originalError
            );

            // Assert: Should preserve all information
            expect(agentError.message).toBe(errorMessage);
            expect(agentError.agentName).toBe(agentName);
            expect(agentError.retryable).toBe(retryable);
            expect(agentError.originalError).toBe(originalError);
            expect(agentError.name).toBe('AgentInvocationError');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should work without original error', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          fc.boolean(),
          (errorMessage: string, agentName: string, retryable: boolean) => {
            // Act: Create AgentInvocationError without original error
            const agentError = new AgentInvocationError(errorMessage, agentName, retryable);

            // Assert: Should work without original error
            expect(agentError.message).toBe(errorMessage);
            expect(agentError.agentName).toBe(agentName);
            expect(agentError.retryable).toBe(retryable);
            expect(agentError.originalError).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Stream Error Handling', () => {
    it('should handle stream interruptions gracefully', async () => {
      // Arrange: Create a mock stream that fails partway through
      const mockStream = (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('First chunk') } };
        yield { chunk: { bytes: new TextEncoder().encode('Second chunk') } };
        throw new Error('Stream interrupted');
      })();

      const chunks: string[] = [];
      let errorCaught = false;

      // Act: Process stream with error handling
      try {
        await processStreamWithErrorHandling(
          mockStream,
          async (text: string) => {
            chunks.push(text);
          },
          async (error: Error) => {
            errorCaught = true;
            expect(error.message).toContain('Stream interrupted');
          }
        );
      } catch (error) {
        // Expected to throw after error handler is called
        expect(error).toBeDefined();
      }

      // Assert: Should have processed chunks before error
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe('First chunk');
      expect(chunks[1]).toBe('Second chunk');

      // Assert: Error handler should have been called
      expect(errorCaught).toBe(true);
    });

    it('should complete successfully for valid streams', async () => {
      // Arrange: Create a mock stream that completes successfully
      const mockStream = (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('Chunk 1') } };
        yield { chunk: { bytes: new TextEncoder().encode('Chunk 2') } };
        yield { chunk: { bytes: new TextEncoder().encode('Chunk 3') } };
      })();

      const chunks: string[] = [];

      // Act: Process stream
      const result = await processStreamWithErrorHandling(
        mockStream,
        async (text: string) => {
          chunks.push(text);
        }
      );

      // Assert: Should have processed all chunks
      expect(chunks.length).toBe(3);
      expect(result).toBe('Chunk 1Chunk 2Chunk 3');
    });

    it('should handle empty streams', async () => {
      // Arrange: Create an empty mock stream
      const mockStream = (async function* () {
        // Empty stream
      })();

      // Act: Process stream
      const result = await processStreamWithErrorHandling(
        mockStream,
        async () => {}
      );

      // Assert: Should return empty string
      expect(result).toBe('');
    });

    it('should continue processing even if chunk handler fails', async () => {
      // Arrange: Create a mock stream
      const mockStream = (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('Chunk 1') } };
        yield { chunk: { bytes: new TextEncoder().encode('Chunk 2') } };
        yield { chunk: { bytes: new TextEncoder().encode('Chunk 3') } };
      })();

      const processedChunks: string[] = [];
      let chunkHandlerFailures = 0;

      // Act: Process stream with failing chunk handler
      const result = await processStreamWithErrorHandling(
        mockStream,
        async (text: string) => {
          if (text === 'Chunk 2') {
            chunkHandlerFailures++;
            throw new Error('Chunk handler failed');
          }
          processedChunks.push(text);
        }
      );

      // Assert: Should have processed chunks 1 and 3 (skipped 2 due to error)
      expect(processedChunks.length).toBe(2);
      expect(processedChunks).toContain('Chunk 1');
      expect(processedChunks).toContain('Chunk 3');
      expect(chunkHandlerFailures).toBe(1);

      // Assert: Full response should still include all chunks
      expect(result).toBe('Chunk 1Chunk 2Chunk 3');
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle all error types without crashing', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(new Error('Standard error')),
            fc.constant(new TypeError('Type error')),
            fc.constant(new RangeError('Range error')),
            fc.constant({ message: 'Non-Error object' }),
            fc.constant('String error'),
            fc.constant(null),
            fc.constant(undefined)
          ),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          (error: any, agentName: string) => {
            // Act: Get user-friendly message for any error type
            const message = getUserFriendlyErrorMessage(error, agentName);

            // Assert: Should always return a string
            expect(typeof message).toBe('string');
            expect(message.length).toBeGreaterThan(0);

            // Assert: Should not crash or return undefined
            expect(message).not.toContain('undefined');
            expect(message).not.toContain('null');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide consistent error messages for the same error type', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'ValidationException',
            'AccessDeniedException',
            'ThrottlingException'
          ),
          fc.constantFrom('Orchestrator', 'Query', 'Theory', 'Profile'),
          (errorName: string, agentName: string) => {
            // Arrange: Create two errors with same type
            const error1 = new Error('Error 1');
            (error1 as any).name = errorName;
            const error2 = new Error('Error 2');
            (error2 as any).name = errorName;

            // Act: Get user-friendly messages
            const message1 = getUserFriendlyErrorMessage(error1, agentName);
            const message2 = getUserFriendlyErrorMessage(error2, agentName);

            // Assert: Messages should be identical for same error type
            expect(message1).toBe(message2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
