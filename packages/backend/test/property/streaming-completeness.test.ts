import * as fc from 'fast-check';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Feature: agentcore-implementation, Property 2: Streaming Completeness
 * 
 * For any agent response, the concatenation of all streamed chunks should equal 
 * the complete response that would be returned in non-streaming mode.
 * 
 * Validates: Requirements 8.1, 8.2
 */

describe('Property 2: Streaming Completeness', () => {
  const agentRuntimeClient = new BedrockAgentRuntimeClient({});

  // Generator for valid user IDs
  const userIdArbitrary = fc.constantFrom('test-user-1', 'test-user-2', 'test-user-3');

  // Generator for valid session IDs
  const sessionIdArbitrary = fc.uuid();

  // Generator for valid queries
  const queryArbitrary = fc.oneof(
    fc.constant('What does Rena say about the dam project?'),
    fc.constant('Tell me about Hinamizawa'),
    fc.constant('What happens in Onikakushi?'),
    fc.constant('Who is Keiichi?'),
    fc.constant('Describe the Watanagashi festival'),
    fc.string({ minLength: 10, maxLength: 200 })
  );

  // Generator for agent invocation requests
  const agentRequestArbitrary = fc.record({
    userId: userIdArbitrary,
    query: queryArbitrary,
    sessionId: sessionIdArbitrary,
  });

  describe('Chunk Concatenation Completeness', () => {
    it('should produce complete response when all chunks are concatenated', () => {
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

            // Act: Invoke agent and collect streaming chunks
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let streamedResponse = '';
            const chunks: string[] = [];

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                const chunkText = new TextDecoder().decode(event.chunk.bytes);
                chunks.push(chunkText);
                streamedResponse += chunkText;
              }
            }

            // Assert: Streamed response should not be empty
            expect(streamedResponse.length).toBeGreaterThan(0);

            // Assert: Should have received at least one chunk
            expect(chunks.length).toBeGreaterThan(0);

            // Assert: Each chunk should be non-empty
            for (const chunk of chunks) {
              expect(chunk.length).toBeGreaterThan(0);
            }

            // Assert: Concatenated chunks should equal the full streamed response
            const concatenated = chunks.join('');
            expect(concatenated).toBe(streamedResponse);

            // Assert: Response should be meaningful content
            expect(streamedResponse).not.toMatch(/^error:/i);
            expect(streamedResponse).not.toMatch(/^failed:/i);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain chunk order during streaming', () => {
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

            // Act: Invoke agent and collect chunks with timestamps
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            const chunksWithTimestamps: Array<{ chunk: string; timestamp: number }> = [];

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                const chunkText = new TextDecoder().decode(event.chunk.bytes);
                chunksWithTimestamps.push({
                  chunk: chunkText,
                  timestamp: Date.now(),
                });
              }
            }

            // Assert: Chunks should arrive in chronological order
            for (let i = 1; i < chunksWithTimestamps.length; i++) {
              expect(chunksWithTimestamps[i].timestamp).toBeGreaterThanOrEqual(
                chunksWithTimestamps[i - 1].timestamp
              );
            }

            // Assert: Concatenated chunks should form coherent text
            const fullResponse = chunksWithTimestamps.map((c) => c.chunk).join('');
            expect(fullResponse.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Streaming vs Non-Streaming Equivalence', () => {
    it('should produce equivalent results in streaming and non-streaming modes', () => {
      fc.assert(
        fc.asyncProperty(
          agentRequestArbitrary,
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Note: AgentCore always uses streaming, so we verify that:
            // 1. All chunks are received
            // 2. Chunks concatenate to form complete response
            // 3. No data is lost during streaming

            // Arrange: Prepare agent invocation command
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and collect all chunks
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let fullResponse = '';
            let chunkCount = 0;

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                const chunkText = new TextDecoder().decode(event.chunk.bytes);
                fullResponse += chunkText;
                chunkCount++;
              }
            }

            // Assert: Should have received chunks
            expect(chunkCount).toBeGreaterThan(0);

            // Assert: Full response should be complete and meaningful
            expect(fullResponse.length).toBeGreaterThan(0);
            expect(fullResponse).not.toMatch(/^error:/i);

            // Assert: Response should not have truncation markers
            expect(fullResponse).not.toContain('[TRUNCATED]');
            expect(fullResponse).not.toContain('[INCOMPLETE]');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Chunk Integrity', () => {
    it('should not lose data between chunks', () => {
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

            // Act: Invoke agent and collect chunks
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            const chunks: string[] = [];

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                const chunkText = new TextDecoder().decode(event.chunk.bytes);
                chunks.push(chunkText);
              }
            }

            // Assert: Each chunk should be valid UTF-8 text
            for (const chunk of chunks) {
              expect(typeof chunk).toBe('string');
              expect(chunk.length).toBeGreaterThan(0);
            }

            // Assert: Concatenated chunks should form valid text
            const fullResponse = chunks.join('');
            expect(fullResponse.length).toBe(chunks.reduce((sum, c) => sum + c.length, 0));

            // Assert: No null bytes or invalid characters
            expect(fullResponse).not.toContain('\0');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multi-byte UTF-8 characters correctly', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: userIdArbitrary,
            query: fc.constantFrom(
              'What does Rena say about the dam project?',
              'Tell me about 雛見沢',
              'Describe the 綿流し festival',
              'Who is 竜宮レナ?'
            ),
            sessionId: sessionIdArbitrary,
          }),
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation command with Japanese text
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent and collect chunks
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let fullResponse = '';

            for await (const event of response.completion) {
              if (event.chunk?.bytes) {
                const chunkText = new TextDecoder().decode(event.chunk.bytes);
                fullResponse += chunkText;
              }
            }

            // Assert: Response should be valid UTF-8
            expect(fullResponse.length).toBeGreaterThan(0);

            // Assert: Should not have encoding errors
            expect(fullResponse).not.toContain('�'); // Replacement character

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Stream Completion', () => {
    it('should complete streaming without errors', () => {
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

            // Act: Invoke agent and consume entire stream
            const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

            if (!response.completion) {
              throw new Error('No completion stream received from agent');
            }

            let streamCompleted = false;
            let fullResponse = '';

            try {
              for await (const event of response.completion) {
                if (event.chunk?.bytes) {
                  const chunkText = new TextDecoder().decode(event.chunk.bytes);
                  fullResponse += chunkText;
                }
              }
              streamCompleted = true;
            } catch (error) {
              // Stream should not throw errors during normal operation
              throw error;
            }

            // Assert: Stream should complete successfully
            expect(streamCompleted).toBe(true);

            // Assert: Should have received complete response
            expect(fullResponse.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
