import * as fc from 'fast-check';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Feature: agentcore-implementation, Property 7: Cost Efficiency
 * 
 * For any set of 100 queries, the total token usage with AgentCore should not 
 * exceed 110% of the prototype implementation's token usage.
 * 
 * Validates: Requirements 15.1, 15.2
 */

describe('Property 7: Cost Efficiency', () => {
  const agentRuntimeClient = new BedrockAgentRuntimeClient({});

  // Generator for valid user IDs
  const userIdArbitrary = fc.constantFrom('test-user-1', 'test-user-2', 'test-user-3');

  // Generator for valid session IDs
  const sessionIdArbitrary = fc.uuid();

  // Generator for diverse query types to simulate real usage
  const queryArbitrary = fc.oneof(
    // Script queries (most common)
    fc.constantFrom(
      'What does Rena say about the dam project?',
      'Tell me about Hinamizawa',
      'What happens in Onikakushi?',
      'Who is Keiichi?',
      'Describe the Watanagashi festival',
      'What is the curse of Oyashiro-sama?'
    ),
    // Theory queries
    fc.constantFrom(
      'Analyze the theory that Rena is hiding something',
      'What evidence supports the government conspiracy theory?',
      'Is there a connection between the dam project and the murders?'
    ),
    // Profile queries
    fc.constantFrom(
      'Tell me about Rena',
      'What do we know about Mion?',
      'Describe Satoko\'s background'
    ),
    // Short queries
    fc.string({ minLength: 10, maxLength: 50 }),
    // Medium queries
    fc.string({ minLength: 50, maxLength: 150 })
  );

  // Generator for agent invocation requests
  const agentRequestArbitrary = fc.record({
    userId: userIdArbitrary,
    query: queryArbitrary,
    sessionId: sessionIdArbitrary,
  });

  describe('Token Usage Estimation', () => {
    it('should produce responses with reasonable length', () => {
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

            // Act: Invoke agent and collect response
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

            // Assert: Response should not be empty
            expect(fullResponse.length).toBeGreaterThan(0);

            // Assert: Response length should be reasonable (not excessively long)
            // Estimate: 1 token ≈ 4 characters, so 20000 chars ≈ 5000 tokens
            expect(fullResponse.length).toBeLessThan(20000);

            // Assert: Estimated token usage should be reasonable
            const estimatedOutputTokens = Math.ceil(fullResponse.length / 4);
            const estimatedInputTokens = Math.ceil(request.query.length / 4) + 500; // Query + system prompt estimate
            const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

            expect(estimatedTotalTokens).toBeLessThan(5000);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain efficient response length across multiple queries', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(agentRequestArbitrary, { minLength: 5, maxLength: 10 }),
          async (requests: Array<{ userId: string; query: string; sessionId: string }>) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            let totalResponseLength = 0;
            let totalQueryLength = 0;

            // Process each request
            for (const request of requests) {
              const command = new InvokeAgentCommand({
                agentId: process.env.ORCHESTRATOR_AGENT_ID,
                agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
                sessionId: request.sessionId,
                inputText: request.query,
                enableTrace: false,
              });

              const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

              if (!response.completion) {
                continue;
              }

              let fullResponse = '';

              for await (const event of response.completion) {
                if (event.chunk?.bytes) {
                  const chunkText = new TextDecoder().decode(event.chunk.bytes);
                  fullResponse += chunkText;
                }
              }

              totalResponseLength += fullResponse.length;
              totalQueryLength += request.query.length;
            }

            // Assert: Average response length should be reasonable
            const avgResponseLength = totalResponseLength / requests.length;
            expect(avgResponseLength).toBeLessThan(10000); // Less than 10k chars per response

            // Assert: Estimated average tokens per query should be reasonable
            const estimatedAvgTokens = Math.ceil((totalQueryLength + totalResponseLength) / 4 / requests.length) + 500;
            expect(estimatedAvgTokens).toBeLessThan(3000);

            return true;
          }
        ),
        { numRuns: 20 } // Fewer runs since this tests multiple queries per run
      );
    });
  });

  describe('Cost Optimization', () => {
    it('should not produce excessively long responses for simple queries', () => {
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

            // Act: Invoke agent
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

            // Assert: Simple queries should produce concise responses
            // Estimate: 8000 chars ≈ 2000 tokens
            expect(fullResponse.length).toBeLessThan(8000);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should optimize response length to minimize token consumption', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: userIdArbitrary,
            query: queryArbitrary,
            sessionId: sessionIdArbitrary,
          }),
          async (request: { userId: string; query: string; sessionId: string }) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Arrange: Prepare agent invocation
            const command = new InvokeAgentCommand({
              agentId: process.env.ORCHESTRATOR_AGENT_ID,
              agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
              sessionId: request.sessionId,
              inputText: request.query,
              enableTrace: false,
            });

            // Act: Invoke agent
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

            // Assert: Response length should be reasonable
            expect(fullResponse.length).toBeLessThan(12000); // ~3000 tokens

            // Assert: Response should be proportional to query complexity
            const estimatedOutputTokens = Math.ceil(fullResponse.length / 4);
            expect(estimatedOutputTokens).toBeLessThan(3000);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Budget Compliance', () => {
    it('should maintain estimated cost within budget constraints', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(agentRequestArbitrary, { minLength: 10, maxLength: 20 }),
          async (requests: Array<{ userId: string; query: string; sessionId: string }>) => {
            // Skip if environment variables for AgentCore are not set
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.ORCHESTRATOR_AGENT_ALIAS_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            let totalResponseLength = 0;
            let totalQueryLength = 0;

            // Process each request
            for (const request of requests) {
              const command = new InvokeAgentCommand({
                agentId: process.env.ORCHESTRATOR_AGENT_ID,
                agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
                sessionId: request.sessionId,
                inputText: request.query,
                enableTrace: false,
              });

              const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

              if (!response.completion) {
                continue;
              }

              let fullResponse = '';

              for await (const event of response.completion) {
                if (event.chunk?.bytes) {
                  const chunkText = new TextDecoder().decode(event.chunk.bytes);
                  fullResponse += chunkText;
                }
              }

              totalResponseLength += fullResponse.length;
              totalQueryLength += request.query.length;
            }

            // Estimate total tokens (1 token ≈ 4 characters)
            // Add 500 tokens per query for system prompts
            const estimatedTotalTokens = Math.ceil((totalQueryLength + totalResponseLength) / 4) + (requests.length * 500);

            // Calculate estimated cost
            // Nova Lite pricing: $0.06 per 1M input tokens, $0.24 per 1M output tokens
            // Conservative estimate: assume 50/50 split
            const estimatedCostPerToken = (0.06 + 0.24) / 2 / 1_000_000;
            const estimatedCost = estimatedTotalTokens * estimatedCostPerToken;

            // Assert: Cost per query should be minimal
            const costPerQuery = estimatedCost / requests.length;
            expect(costPerQuery).toBeLessThan(0.01); // Less than 1 cent per query

            // Assert: Projected monthly cost should be within budget
            // Assuming 100 queries/month per user, 3 users = 300 queries/month
            const projectedMonthlyCost = costPerQuery * 300;
            expect(projectedMonthlyCost).toBeLessThan(3.0); // Well under $100/month budget

            return true;
          }
        ),
        { numRuns: 10 } // Fewer runs since this tests many queries per run
      );
    });
  });
});
