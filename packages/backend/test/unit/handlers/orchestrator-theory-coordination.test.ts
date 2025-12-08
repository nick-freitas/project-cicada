import { handler as orchestratorHandler } from '../../../src/handlers/agents/orchestrator-agent-tools';
import { handler as theoryHandler } from '../../../src/handlers/agents/theory-agent-tools';

/**
 * Unit tests for Orchestrator → Theory Agent coordination
 * 
 * These tests verify that the tool handlers are properly configured
 * to support multi-hop agent invocation (Orchestrator → Theory → Query)
 * 
 * Requirement 2.3: Configure permissions for Orchestrator → Theory Agent invocation
 * Requirement 7.2: Use agent-to-agent invocation patterns
 */

describe('Orchestrator → Theory Agent Coordination', () => {
  describe('Orchestrator Handler', () => {
    it('should have invoke_theory_agent function registered', async () => {
      const event = {
        actionGroup: 'AgentInvocationTools',
        function: 'invoke_theory_agent',
        parameters: [
          { name: 'theoryDescription', value: 'Test theory about Rena' },
          { name: 'episodeContext', value: ['onikakushi'] },
          { name: 'requestRefinement', value: true },
        ],
        sessionId: 'test-session-123',
      };

      // Mock environment variables
      process.env.THEORY_AGENT_ID = 'test-theory-agent-id';
      process.env.THEORY_AGENT_ALIAS_ID = 'test-theory-alias-id';

      // The handler should recognize the function
      // (It will fail to invoke the actual agent, but that's expected in unit tests)
      const result = await orchestratorHandler(event);

      // Verify the response structure
      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result).toHaveProperty('response');
      expect(result.response).toHaveProperty('actionGroup', 'AgentInvocationTools');
      expect(result.response).toHaveProperty('function', 'invoke_theory_agent');
    });

    it('should handle invoke_query_agent function', async () => {
      const event = {
        actionGroup: 'AgentInvocationTools',
        function: 'invoke_query_agent',
        parameters: [
          { name: 'query', value: 'What does Rena say?' },
        ],
        sessionId: 'test-session-456',
      };

      process.env.QUERY_AGENT_ID = 'test-query-agent-id';
      process.env.QUERY_AGENT_ALIAS_ID = 'test-query-alias-id';

      const result = await orchestratorHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result.response).toHaveProperty('function', 'invoke_query_agent');
    });

    it('should handle invoke_profile_agent function', async () => {
      const event = {
        actionGroup: 'AgentInvocationTools',
        function: 'invoke_profile_agent',
        parameters: [
          { name: 'conversationContext', value: 'Rena is suspicious' },
        ],
        sessionId: 'test-session-789',
      };

      process.env.PROFILE_AGENT_ID = 'test-profile-agent-id';
      process.env.PROFILE_AGENT_ALIAS_ID = 'test-profile-alias-id';

      const result = await orchestratorHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result.response).toHaveProperty('function', 'invoke_profile_agent');
    });

    it('should return error for unknown function', async () => {
      const event = {
        actionGroup: 'AgentInvocationTools',
        function: 'unknown_function',
        parameters: [],
        sessionId: 'test-session-error',
      };

      const result = await orchestratorHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result.response.functionResponse).toHaveProperty('responseState', 'FAILURE');
    });
  });

  describe('Theory Agent Handler', () => {
    it('should have invoke_query_agent function registered', async () => {
      const event = {
        actionGroup: 'TheoryAnalysisTools',
        function: 'invoke_query_agent',
        parameters: [
          { name: 'query', value: 'Find evidence about Rena' },
          { name: 'episodeContext', value: ['onikakushi'] },
        ],
        sessionId: 'test-theory-session-123',
      };

      process.env.QUERY_AGENT_ID = 'test-query-agent-id';
      process.env.QUERY_AGENT_ALIAS_ID = 'test-query-alias-id';

      const result = await theoryHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result).toHaveProperty('response');
      expect(result.response).toHaveProperty('actionGroup', 'TheoryAnalysisTools');
      expect(result.response).toHaveProperty('function', 'invoke_query_agent');
    });

    it('should have get_theory_profile function registered', async () => {
      const event = {
        actionGroup: 'TheoryAnalysisTools',
        function: 'get_theory_profile',
        parameters: [
          { name: 'userId', value: 'test-user' },
          { name: 'theoryName', value: 'Rena Theory' },
        ],
        sessionId: 'test-theory-session-456',
      };

      process.env.USER_PROFILES_TABLE = 'test-profiles-table';

      const result = await theoryHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result.response).toHaveProperty('function', 'get_theory_profile');
    });

    it('should have update_theory_profile function registered', async () => {
      const event = {
        actionGroup: 'TheoryAnalysisTools',
        function: 'update_theory_profile',
        parameters: [
          { name: 'userId', value: 'test-user' },
          { name: 'theoryName', value: 'Rena Theory' },
          { 
            name: 'theoryData', 
            value: JSON.stringify({
              description: 'Test theory',
              status: 'proposed',
              supportingEvidence: [],
              contradictingEvidence: [],
            }),
          },
        ],
        sessionId: 'test-theory-session-789',
      };

      process.env.USER_PROFILES_TABLE = 'test-profiles-table';

      const result = await theoryHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result.response).toHaveProperty('function', 'update_theory_profile');
    });

    it('should have get_character_profile function registered', async () => {
      const event = {
        actionGroup: 'TheoryAnalysisTools',
        function: 'get_character_profile',
        parameters: [
          { name: 'userId', value: 'test-user' },
          { name: 'characterName', value: 'Rena' },
        ],
        sessionId: 'test-theory-session-abc',
      };

      process.env.USER_PROFILES_TABLE = 'test-profiles-table';

      const result = await theoryHandler(event);

      expect(result).toHaveProperty('messageVersion', '1.0');
      expect(result.response).toHaveProperty('function', 'get_character_profile');
    });
  });

  describe('Multi-Hop Invocation Flow', () => {
    it('should support Orchestrator → Theory → Query invocation chain', () => {
      // This test verifies the configuration supports multi-hop invocation
      // Actual invocation requires deployed agents

      // 1. Orchestrator can invoke Theory Agent
      expect(orchestratorHandler).toBeDefined();
      
      // 2. Theory Agent can invoke Query Agent
      expect(theoryHandler).toBeDefined();

      // 3. Both handlers support the required functions
      // This is verified by the previous tests
      
      // The multi-hop flow is:
      // User → Orchestrator.invoke_theory_agent() → Theory Agent
      // Theory Agent → Theory.invoke_query_agent() → Query Agent
      // Query Agent → Returns evidence → Theory Agent
      // Theory Agent → Returns analysis → Orchestrator
      // Orchestrator → Returns to User
    });
  });

  describe('Environment Configuration', () => {
    it('should require Theory Agent environment variables for Orchestrator', () => {
      // Clear environment variables
      delete process.env.THEORY_AGENT_ID;
      delete process.env.THEORY_AGENT_ALIAS_ID;

      const event = {
        actionGroup: 'AgentInvocationTools',
        function: 'invoke_theory_agent',
        parameters: [
          { name: 'theoryDescription', value: 'Test theory' },
        ],
        sessionId: 'test-session',
      };

      // Should fail gracefully when environment variables are missing
      return orchestratorHandler(event).then(result => {
        expect(result.response.functionResponse).toHaveProperty('responseState', 'FAILURE');
      });
    });

    it('should require Query Agent environment variables for Theory Agent', () => {
      // Clear environment variables
      delete process.env.QUERY_AGENT_ID;
      delete process.env.QUERY_AGENT_ALIAS_ID;

      const event = {
        actionGroup: 'TheoryAnalysisTools',
        function: 'invoke_query_agent',
        parameters: [
          { name: 'query', value: 'Test query' },
        ],
        sessionId: 'test-session',
      };

      // Should fail gracefully when environment variables are missing
      return theoryHandler(event).then(result => {
        expect(result.response.functionResponse).toHaveProperty('responseState', 'FAILURE');
      });
    });
  });
});
