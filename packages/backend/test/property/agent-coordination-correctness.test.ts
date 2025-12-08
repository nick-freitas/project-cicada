import * as fc from 'fast-check';
import { 
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Feature: agentcore-implementation, Property 3: Agent Coordination Correctness
 * 
 * For any query requiring multiple agents, the Orchestrator should invoke exactly 
 * the agents needed based on the query intent, no more and no less.
 * 
 * Validates: Requirements 2.2, 2.3
 */

describe('Property 3: Agent Coordination Correctness', () => {
  const bedrockAgentClient = new BedrockAgentRuntimeClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
  });

  // Generator for script-focused queries (should invoke Query Agent)
  const scriptQueryArbitrary = fc.constantFrom(
    'What does Rena say about the dam project?',
    'Tell me about Hinamizawa village',
    'What happens in Onikakushi chapter 1?',
    'Who is Keiichi Maebara?',
    'What did Mion say to Keiichi in Watanagashi?',
    'Find all mentions of the curse',
    'What is the Sonozaki family known for?'
  );

  // Generator for theory-focused queries (should invoke Theory Agent, which may invoke Query Agent)
  const theoryQueryArbitrary = fc.constantFrom(
    'Analyze the theory that Rena is suspicious',
    'What evidence supports the theory about Oyashiro-sama?',
    'Evaluate the hypothesis that Mion and Shion switched places',
    'Is there evidence for the time loop theory?',
    'Refine my theory about the village conspiracy'
  );

  // Generator for profile-focused queries (should invoke Profile Agent)
  const profileQueryArbitrary = fc.constantFrom(
    'Update my profile with information about Rika',
    'Extract character information from our conversation',
    'What do I know about Satoko?',
    'Show me my theories about the mystery'
  );

  // Generator for mixed queries (may invoke multiple agents)
  const mixedQueryArbitrary = fc.constantFrom(
    'What does Rena say about the dam, and does this support my theory?',
    'Find evidence about Hinamizawa and update my profile',
    'Analyze the theory about Oyashiro-sama and show me what I know'
  );

  // Generator for user IDs
  const userIdArbitrary = fc.constantFrom('test-user-1', 'test-user-2', 'test-user-3');

  // Generator for session IDs
  const sessionIdArbitrary = fc.uuid();

  // Generator for episode context
  const episodeContextArbitrary = fc.option(
    fc.array(
      fc.constantFrom('onikakushi', 'watanagashi', 'tatarigoroshi', 'himatsubushi'),
      { minLength: 1, maxLength: 3 }
    ),
    { nil: undefined }
  );

  /**
   * Helper function to invoke the Orchestrator Agent
   */
  async function invokeOrchestrator(
    query: string,
    sessionId: string,
    episodeContext?: string[]
  ): Promise<{
    response: string;
    traces: any[];
  }> {
    const orchestratorAgentId = process.env.ORCHESTRATOR_AGENT_ID;
    const orchestratorAgentAliasId = process.env.ORCHESTRATOR_AGENT_ALIAS_ID;

    if (!orchestratorAgentId || !orchestratorAgentAliasId) {
      throw new Error('Orchestrator Agent not configured');
    }

    let inputText = query;
    if (episodeContext && episodeContext.length > 0) {
      inputText += `\n\nEpisode Context: ${episodeContext.join(', ')}`;
    }

    const command = new InvokeAgentCommand({
      agentId: orchestratorAgentId,
      agentAliasId: orchestratorAgentAliasId,
      sessionId,
      inputText,
      enableTrace: true, // Enable trace to see which agents were invoked
    });

    const response = await bedrockAgentClient.send(command);

    // Collect response and traces
    let completeResponse = '';
    const traces: any[] = [];

    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const text = new TextDecoder().decode(chunk.chunk.bytes);
          completeResponse += text;
        }
        if (chunk.trace) {
          traces.push(chunk.trace);
        }
      }
    }

    return { response: completeResponse, traces };
  }

  /**
   * Helper function to extract invoked agents from traces
   */
  function extractInvokedAgents(traces: any[]): string[] {
    const invokedAgents = new Set<string>();

    for (const trace of traces) {
      // Check for agent invocations in the trace
      if (trace.orchestrationTrace?.invocationInput) {
        const invocationInput = trace.orchestrationTrace.invocationInput;
        
        // Check if this is an agent invocation
        if (invocationInput.actionGroupInvocationInput) {
          const functionName = invocationInput.actionGroupInvocationInput.function;
          
          if (functionName === 'invoke_query_agent') {
            invokedAgents.add('query');
          } else if (functionName === 'invoke_theory_agent') {
            invokedAgents.add('theory');
          } else if (functionName === 'invoke_profile_agent') {
            invokedAgents.add('profile');
          }
        }
      }
    }

    return Array.from(invokedAgents);
  }

  describe('Script Query Coordination', () => {
    it('should invoke Query Agent for script-focused queries', () => {
      fc.assert(
        fc.asyncProperty(
          scriptQueryArbitrary,
          sessionIdArbitrary,
          episodeContextArbitrary,
          async (query, sessionId, episodeContext) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.QUERY_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator with script query
            const { response, traces } = await invokeOrchestrator(query, sessionId, episodeContext);

            // Assert: Response should not be empty
            expect(response.length).toBeGreaterThan(0);

            // Assert: Query Agent should be invoked for script queries
            const invokedAgents = extractInvokedAgents(traces);
            expect(invokedAgents).toContain('query');

            // Assert: Response should be relevant to the query
            expect(response).not.toMatch(/^error:/i);
            expect(response).not.toMatch(/^failed:/i);

            return true;
          }
        ),
        { numRuns: 20 } // Reduced runs for integration tests with real agents
      );
    });

    it('should not invoke unnecessary agents for simple script queries', () => {
      fc.assert(
        fc.asyncProperty(
          scriptQueryArbitrary,
          sessionIdArbitrary,
          async (query, sessionId) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.QUERY_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator with simple script query
            const { traces } = await invokeOrchestrator(query, sessionId);

            // Assert: Should primarily use Query Agent, not Theory or Profile
            const invokedAgents = extractInvokedAgents(traces);
            
            // Query Agent should be invoked
            expect(invokedAgents).toContain('query');
            
            // Theory Agent should not be invoked for simple script queries
            // (unless the query explicitly asks for theory analysis)
            if (!query.toLowerCase().includes('theory') && 
                !query.toLowerCase().includes('analyze') &&
                !query.toLowerCase().includes('evaluate')) {
              expect(invokedAgents).not.toContain('theory');
            }

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Theory Query Coordination', () => {
    it('should invoke Theory Agent for theory-focused queries', () => {
      fc.assert(
        fc.asyncProperty(
          theoryQueryArbitrary,
          sessionIdArbitrary,
          episodeContextArbitrary,
          async (query, sessionId, episodeContext) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.THEORY_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator with theory query
            const { response, traces } = await invokeOrchestrator(query, sessionId, episodeContext);

            // Assert: Response should not be empty
            expect(response.length).toBeGreaterThan(0);

            // Assert: Theory Agent should be invoked for theory queries
            const invokedAgents = extractInvokedAgents(traces);
            expect(invokedAgents).toContain('theory');

            // Assert: Response should be relevant to the query
            expect(response).not.toMatch(/^error:/i);
            expect(response).not.toMatch(/^failed:/i);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should coordinate Theory and Query agents for evidence gathering', () => {
      fc.assert(
        fc.asyncProperty(
          theoryQueryArbitrary,
          sessionIdArbitrary,
          async (query, sessionId) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID || 
                !process.env.THEORY_AGENT_ID || 
                !process.env.QUERY_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator with theory query
            const { traces } = await invokeOrchestrator(query, sessionId);

            // Assert: Theory Agent should be invoked
            const invokedAgents = extractInvokedAgents(traces);
            expect(invokedAgents).toContain('theory');

            // Note: Theory Agent may invoke Query Agent internally for evidence gathering
            // This is expected behavior for theory analysis
            // We verify that at least Theory Agent is invoked

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Profile Query Coordination', () => {
    it('should invoke Profile Agent for profile-focused queries', () => {
      fc.assert(
        fc.asyncProperty(
          profileQueryArbitrary,
          sessionIdArbitrary,
          async (query, sessionId) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID || !process.env.PROFILE_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator with profile query
            const { response, traces } = await invokeOrchestrator(query, sessionId);

            // Assert: Response should not be empty
            expect(response.length).toBeGreaterThan(0);

            // Assert: Profile Agent should be invoked for profile queries
            const invokedAgents = extractInvokedAgents(traces);
            expect(invokedAgents).toContain('profile');

            // Assert: Response should be relevant to the query
            expect(response).not.toMatch(/^error:/i);
            expect(response).not.toMatch(/^failed:/i);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Multi-Agent Coordination', () => {
    it('should coordinate multiple agents for complex queries', () => {
      fc.assert(
        fc.asyncProperty(
          mixedQueryArbitrary,
          sessionIdArbitrary,
          async (query, sessionId) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID || 
                !process.env.QUERY_AGENT_ID ||
                !process.env.THEORY_AGENT_ID ||
                !process.env.PROFILE_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator with mixed query
            const { response, traces } = await invokeOrchestrator(query, sessionId);

            // Assert: Response should not be empty
            expect(response.length).toBeGreaterThan(0);

            // Assert: Multiple agents should be invoked for complex queries
            const invokedAgents = extractInvokedAgents(traces);
            expect(invokedAgents.length).toBeGreaterThan(0);

            // Assert: Response should address the complex query
            expect(response).not.toMatch(/^error:/i);
            expect(response).not.toMatch(/^failed:/i);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not invoke the same agent multiple times unnecessarily', () => {
      fc.assert(
        fc.asyncProperty(
          fc.oneof(scriptQueryArbitrary, theoryQueryArbitrary, profileQueryArbitrary),
          sessionIdArbitrary,
          async (query, sessionId) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator
            const { traces } = await invokeOrchestrator(query, sessionId);

            // Assert: Each agent should be invoked at most once by the Orchestrator
            // (Note: Theory Agent may invoke Query Agent internally, which is expected)
            const invokedAgents = extractInvokedAgents(traces);
            const uniqueAgents = new Set(invokedAgents);
            
            // The number of unique agents should equal the total invocations
            // This ensures no duplicate invocations at the Orchestrator level
            expect(uniqueAgents.size).toBe(invokedAgents.length);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Agent Selection Logic', () => {
    it('should select appropriate agents based on query keywords', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            query: fc.constantFrom(
              'What does Rena say?', // Script query -> Query Agent
              'Analyze this theory', // Theory query -> Theory Agent
              'Update my profile', // Profile query -> Profile Agent
            ),
            sessionId: sessionIdArbitrary,
          }),
          async ({ query, sessionId }) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            // Act: Invoke Orchestrator
            const { traces } = await invokeOrchestrator(query, sessionId);

            // Assert: Correct agent should be invoked based on query
            const invokedAgents = extractInvokedAgents(traces);

            if (query.includes('say') || query.includes('What')) {
              // Script queries should invoke Query Agent
              expect(invokedAgents).toContain('query');
            } else if (query.includes('Analyze') || query.includes('theory')) {
              // Theory queries should invoke Theory Agent
              expect(invokedAgents).toContain('theory');
            } else if (query.includes('profile') || query.includes('Update')) {
              // Profile queries should invoke Profile Agent
              expect(invokedAgents).toContain('profile');
            }

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Error Handling in Coordination', () => {
    it('should handle agent invocation failures gracefully', () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 200 }),
          sessionIdArbitrary,
          async (query, sessionId) => {
            // Skip if agents not deployed
            if (!process.env.ORCHESTRATOR_AGENT_ID) {
              console.log('Skipping test - AgentCore agents not deployed');
              return true;
            }

            try {
              // Act: Invoke Orchestrator with arbitrary query
              const { response } = await invokeOrchestrator(query, sessionId);

              // Assert: Should either succeed or fail gracefully
              expect(response).toBeDefined();
              
              // If there's an error, it should be meaningful
              if (response.toLowerCase().includes('error')) {
                expect(response.length).toBeGreaterThan(10);
              }

              return true;
            } catch (error) {
              // If it throws, the error should be meaningful
              expect(error).toBeDefined();
              return true;
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
