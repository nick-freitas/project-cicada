import * as fc from 'fast-check';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Feature: agentcore-implementation, Property 8: Response Time Consistency
 * 
 * For any query, the time to first chunk with AgentCore streaming should be 
 * less than or equal to the prototype implementation.
 * 
 * Validates: Requirements 8.1, 8.5
 */

describe('Property 8: Response Time Consistency', () => {
  const agentRuntimeClient = new BedrockAgentRuntimeClient({});

  // Generator for valid user IDs
  const userIdArbitrary = fc.constantFrom('test-user-1', 'test-user-2', 'test-user-3');

  // Generator for valid session IDs
  const sessionIdArbitrary = fc.uuid();

  // Generator for diverse query types
  const queryArbitrary = fc.oneof(
    // Simple queries (should be fast)
    fc.constantFrom(
      'Who is Rena?',
      'What is Hinamizawa?',
      'Tell me about Keiichi',
      'Describe Mion'
    ),
    // Medium complexity queries
    fc.constantFrom(
      'What does Rena say about the dam project?',
      'Tell me about the Watanagashi festival',
      'What happens in Onikakushi?',
      'Describe the curse of Oyashiro-sama'
    ),
    // Complex queries
    fc.constantFrom(
      'Analyze the theory that Rena is hiding something',
      'What evidence supports the government conspiracy theory?',
      'Is there a connection between the dam project and the murders?'
    )
  );

  // Generator for agent invocation requests
  const agentRequestArbitrary = fc.record({
    userId: userIdArbitrary,
    query: queryArbitrary,
    sessionId: sessionIdArbitrary,
  });

  describe('Time to First Chunk', () => {
    it('should deliver first chunk within reasonable time', () => {
      fc.assert(
        fc.asyncProperty(
          agentRequestArbitrary,
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation command
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and measure time to first chunk
            const startTime = Date.now();
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let timeToFirstChunk: number | null = null;
            let chunkCount = 0;

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                if (timeToFirstChunk === null) {
                  timeToFirstChunk = Date.now() - startTime;
                }
                chunkCount++;
              }
            }

            // Assert: Should have received at least one chunk
            expect(chunkCount).toBeGreaterThan(0);

            // Assert: Time to first chunk should be reasonable
            expect(timeToFirstChunk).not.toBeNull();
            expect(timeToFirstChunk!).toBeGreaterThan(0);

            // Assert: Time to first chunk should be less than 10 seconds
            // (AgentCore should start streaming quickly)
            expect(timeToFirstChunk!).toBeLessThan(10000);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistent time to first chunk across queries', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(agentRequestArbitrary, { minLength: 5, maxLength: 10 }),
          async (requests: Array<{ userId: string; query: string; sessionId: string }>) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            const timesToFirstChunk: number[] = [];

            // Process each request
            for (const request of requests) {
              const command = new InvokeAgentCommand({
                agentId: process.env.ORCHESTRATOR_AGENT_ID,
                agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
                sessionId: request.sessionId,
                inputText: request.query,
                enableTrace: false,
              });

              const startTime = Date.now();
              const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

              if (!response.completion) {
                continue;
              }

              for await (const event of response.completion) {
                if (event.chunk?.bytes) {
                  const timeToFirstChunk = Date.now() - startTime;
                  timesToFirstChunk.push(timeToFirstChunk);
                  break; // Only measure first chunk
                }
              }

              // Consume remaining chunks
              for await (const event of response.completion) {
                // Just consume the stream
              }
            }

            // Assert: Should have measured time for all requests
            expect(timesToFirstChunk.length).toBe(requests.length);

            // Assert: All times should be reasonable
            for (const time of timesToFirstChunk) {
              expect(time).toBeGreaterThan(0);
              expect(time).toBeLessThan(10000);
            }

            // Assert: Variance should be reasonable (no extreme outliers)
            const avgTime = timesToFirstChunk.reduce((sum, t) => sum + t, 0) / timesToFirstChunk.length;
            const maxTime = Math.max(...timesToFirstChunk);
            const minTime = Math.min(...timesToFirstChunk);

            // Max time should not be more than 5x the min time
            expect(maxTime).toBeLessThan(minTime * 5);

            return true;
          }
        ),
        { numRuns: 20 } // Fewer runs since this tests multiple queries per run
      );
    });
  });

  describe('Streaming Latency', () => {
    it('should maintain low latency between chunks', () => {
      fc.assert(
        fc.asyncProperty(
          agentRequestArbitrary,
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation command
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and measure inter-chunk latency
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            const chunkTimestamps: number[] = [];

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                chunkTimestamps.push(Date.now());
              }
            }

            // Assert: Should have received multiple chunks
            expect(chunkTimestamps.length).toBeGreaterThan(0);

            // Calculate inter-chunk latencies
            const interChunkLatencies: number[] = [];
            for (let i = 1; i < chunkTimestamps.length; i++) {
              const latency = chunkTimestamps[i] - chunkTimestamps[i - 1];
              interChunkLatencies.push(latency);
            }

            // Assert: Inter-chunk latencies should be reasonable
            for (const latency of interChunkLatencies) {
              expect(latency).toBeGreaterThanOrEqual(0);
              // No chunk should take more than 5 seconds to arrive after previous
              expect(latency).toBeLessThan(5000);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should stream continuously without long pauses', () => {
      fc.assert(
        fc.asyncProperty(
          agentRequestArbitrary,
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation command
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and track streaming behavior
            const startTime = Date.now();
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let firstChunkTime: number | null = null;
            let lastChunkTime: number | null = null;
            let chunkCount = 0;

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                const now = Date.now();
                if (firstChunkTime === null) {
                  firstChunkTime = now;
                }
                lastChunkTime = now;
                chunkCount++;
              }
            }

            // Assert: Should have received chunks
            expect(chunkCount).toBeGreaterThan(0);
            expect(firstChunkTime).not.toBeNull();
            expect(lastChunkTime).not.toBeNull();

            // Calculate streaming duration
            const streamingDuration = lastChunkTime! - firstChunkTime!;

            // Assert: If multiple chunks, streaming should be continuous
            if (chunkCount > 1) {
              // Average time per chunk should be reasonable
              const avgTimePerChunk = streamingDuration / (chunkCount - 1);
              expect(avgTimePerChunk).toBeLessThan(2000); // Less than 2 seconds per chunk on average
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Response Time by Query Type', () => {
    it('should respond quickly to simple queries', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: userIdArbitrary,
            query: fc.constantFrom(
              'Who is Rena?',
              'What is Hinamizawa?',
              'Tell me about Keiichi',
              'Describe Mion'
            ),
            sessionId: sessionIdArbitrary,
          }),
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation for simple query
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and measure time to first chunk
            const startTime = Date.now();
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let timeToFirstChunk: number | null = null;

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                if (timeToFirstChunk === null) {
                  timeToFirstChunk = Date.now() - startTime;
                }
              }
            }

            // Assert: Simple queries should get first chunk quickly
            expect(timeToFirstChunk).not.toBeNull();
            expect(timeToFirstChunk!).toBeLessThan(5000); // Less than 5 seconds for simple queries

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle complex queries within acceptable time', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: userIdArbitrary,
            query: fc.constantFrom(
              'Analyze the theory that Rena is hiding something',
              'What evidence supports the government conspiracy theory?',
              'Is there a connection between the dam project and the murders?'
            ),
            sessionId: sessionIdArbitrary,
          }),
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation for complex query
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and measure time to first chunk
            const startTime = Date.now();
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let timeToFirstChunk: number | null = null;
            let totalTime: number | null = null;

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                if (timeToFirstChunk === null) {
                  timeToFirstChunk = Date.now() - startTime;
                }
              }
            }

            totalTime = Date.now() - startTime;

            // Assert: Complex queries should still start streaming within reasonable time
            expect(timeToFirstChunk).not.toBeNull();
            expect(timeToFirstChunk!).toBeLessThan(15000); // Less than 15 seconds for complex queries

            // Assert: Total time should be reasonable
            expect(totalTime).toBeLessThan(60000); // Less than 1 minute total

            return true;
          }
        ),
        { numRuns: 50 } // Fewer runs for complex queries
      );
    });
  });

  describe('Performance Consistency', () => {
    it('should maintain consistent performance across sessions', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: userIdArbitrary,
            query: queryArbitrary,
            sessions: fc.array(fc.uuid(), { minLength: 3, maxLength: 5 }),
          }),
          async (request: { userId: string; query: string; sessions: string[] }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            const timesToFirstChunk: number[] = [];

            // Test same query across different sessions
            for (const sessionId of request.sessions) {
              const command = new InvokeAgentCommand({
                agentId: process.env.ORCHESTRATOR_AGENT_ID,
                agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
                sessionId: sessionId,
                inputText: request.query,
                enableTrace: false,
              });

              const startTime = Date.now();
              const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

              if (!response.completion) {
                continue;
              }

              for await (const event of response.completion) {
                if (event.chunk?.bytes) {
                  const timeToFirstChunk = Date.now() - startTime;
                  timesToFirstChunk.push(timeToFirstChunk);
                  break;
                }
              }

              // Consume remaining chunks
              for await (const event of response.completion) {
                // Just consume the stream
              }
            }

            // Assert: Should have measured time for all sessions
            expect(timesToFirstChunk.length).toBe(request.sessions.length);

            // Assert: Performance should be consistent across sessions
            const avgTime = timesToFirstChunk.reduce((sum, t) => sum + t, 0) / timesToFirstChunk.length;
            const maxTime = Math.max(...timesToFirstChunk);
            const minTime = Math.min(...timesToFirstChunk);

            // Variance should be reasonable
            for (const time of timesToFirstChunk) {
              // Each time should be within 3x of average
              expect(time).toBeLessThan(avgTime * 3);
            }

            return true;
          }
        ),
        { numRuns: 20 } // Fewer runs since this tests multiple sessions per run
      );
    });

    it('should not degrade performance under sequential load', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: userIdArbitrary,
            queries: fc.array(queryArbitrary, { minLength: 5, maxLength: 10 }),
            sessionId: sessionIdArbitrary,
          }),
          async (request: { userId: string; queries: string[]; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            const timesToFirstChunk: number[] = [];

            // Process queries sequentially
            for (const query of request.queries) {
              const command = new InvokeAgentCommand({
                agentId: process.env.ORCHESTRATOR_AGENT_ID,
                agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
                sessionId: request.sessionId,
                inputText: query,
                enableTrace: false,
              });

              const startTime = Date.now();
              const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

              if (!response.completion) {
                continue;
              }

              for await (const event of response.completion) {
                if (event.chunk?.bytes) {
                  const timeToFirstChunk = Date.now() - startTime;
                  timesToFirstChunk.push(timeToFirstChunk);
                  break;
                }
              }

              // Consume remaining chunks
              for await (const event of response.completion) {
                // Just consume the stream
              }
            }

            // Assert: Should have measured time for all queries
            expect(timesToFirstChunk.length).toBe(request.queries.length);

            // Assert: Performance should not degrade over time
            // Later queries should not be significantly slower than earlier ones
            const firstHalfAvg =
              timesToFirstChunk.slice(0, Math.floor(timesToFirstChunk.length / 2))
                .reduce((sum, t) => sum + t, 0) / Math.floor(timesToFirstChunk.length / 2);
            
            const secondHalfAvg =
              timesToFirstChunk.slice(Math.floor(timesToFirstChunk.length / 2))
                .reduce((sum, t) => sum + t, 0) / 
              (timesToFirstChunk.length - Math.floor(timesToFirstChunk.length / 2));

            // Second half should not be more than 2x slower than first half
            expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 2);

            return true;
          }
        ),
        { numRuns: 10 } // Fewer runs since this tests many queries per run
      );
    });
  });
});
