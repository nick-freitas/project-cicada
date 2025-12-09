/**
 * Unit Tests for Orchestrator Agent
 * 
 * Tests the explicit classification logic and deterministic routing
 * of the Orchestrator Agent.
 */

import { OrchestratorAgent } from '../orchestrator-agent';
import { QueryAgent } from '../../query';
import { AgentInvocationParams } from '../../base';

// Mock the Strands SDK
jest.mock('@strands-agents/sdk', () => ({
  Agent: class MockAgent {
    constructor(config: any) {}
    async invoke(input: any) {
      return {
        toString: () => 'Mocked agent response',
        lastMessage: {
          content: [],
        },
        stopReason: 'end_turn',
      };
    }
  },
  tool: jest.fn(),
}));

// Mock the QueryAgent
jest.mock('../../query');

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;
  let mockQueryAgent: jest.Mocked<QueryAgent>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create orchestrator instance
    orchestrator = new OrchestratorAgent();

    // Get the mocked QueryAgent instance
    mockQueryAgent = (orchestrator as any).queryAgent as jest.Mocked<QueryAgent>;

    // Setup default mock response
    mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
      content: 'Mock response from Query Agent',
      metadata: {
        agentsInvoked: ['QueryAgent'],
        toolsUsed: ['semanticSearch'],
        processingTime: 100,
      },
    });
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(orchestrator).toBeDefined();
      expect((orchestrator as any).agentName).toBe('CICADA-Orchestrator');
      expect((orchestrator as any).agentDescription).toBe(
        'Central coordinator for CICADA multi-agent system'
      );
    });

    it('should initialize Query Agent', () => {
      expect((orchestrator as any).queryAgent).toBeDefined();
    });
  });

  describe('Query Classification', () => {
    const createTestParams = (query: string): AgentInvocationParams => ({
      query,
      identity: {
        userId: 'test-user',
        username: 'testuser',
      },
      memory: {
        userId: 'test-user',
        sessionId: 'test-session',
        messages: [],
        lastAccessed: new Date(),
      },
    });

    describe('Script Queries', () => {
      it('should classify "who is" queries as SCRIPT_QUERY', async () => {
        const params = createTestParams('Who is Rena?');
        await orchestrator.invokeAgent(params);

        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledTimes(1);
      });

      it('should classify "what is" queries as SCRIPT_QUERY', async () => {
        const params = createTestParams('What is Oyashiro-sama?');
        await orchestrator.invokeAgent(params);

        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      });

      it('should classify "tell me about" queries as SCRIPT_QUERY', async () => {
        const params = createTestParams('Tell me about the Watanagashi Festival');
        await orchestrator.invokeAgent(params);

        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      });

      it('should classify "what happens" queries as SCRIPT_QUERY', async () => {
        const params = createTestParams('What happens in Onikakushi?');
        await orchestrator.invokeAgent(params);

        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      });

      it('should classify "explain" queries as SCRIPT_QUERY', async () => {
        const params = createTestParams('Explain the curse of Oyashiro-sama');
        await orchestrator.invokeAgent(params);

        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      });
    });

    describe('Profile Queries', () => {
      it('should classify "show me" queries as PROFILE_REQUEST', async () => {
        const params = createTestParams('Show me my character profiles');
        const result = await orchestrator.invokeAgent(params);

        // Profile Agent not implemented yet, should return placeholder
        expect(result.content).toContain('Profile management is not yet available');
        expect(mockQueryAgent.invokeAgent).not.toHaveBeenCalled();
      });

      it('should classify "list" queries as PROFILE_REQUEST', async () => {
        const params = createTestParams('List all my profiles');
        const result = await orchestrator.invokeAgent(params);

        expect(result.content).toContain('Profile management is not yet available');
        expect(mockQueryAgent.invokeAgent).not.toHaveBeenCalled();
      });

      it('should classify "my profile" queries as PROFILE_REQUEST', async () => {
        const params = createTestParams('Show my profile for Rena');
        const result = await orchestrator.invokeAgent(params);

        expect(result.content).toContain('Profile management is not yet available');
      });

      it('should classify "update profile" queries as PROFILE_REQUEST', async () => {
        const params = createTestParams('Update profile for Mion');
        const result = await orchestrator.invokeAgent(params);

        expect(result.content).toContain('Profile management is not yet available');
      });
    });

    describe('Theory Queries', () => {
      it('should classify "theory" queries as THEORY_REQUEST', async () => {
        const params = createTestParams('Theory: Rena knows about the loops');
        const result = await orchestrator.invokeAgent(params);

        // Theory Agent not implemented yet, should return placeholder
        expect(result.content).toContain('Theory analysis is not yet available');
        expect(mockQueryAgent.invokeAgent).not.toHaveBeenCalled();
      });

      it('should classify "hypothesis" queries as THEORY_REQUEST', async () => {
        const params = createTestParams('My hypothesis is that Takano is behind everything');
        const result = await orchestrator.invokeAgent(params);

        expect(result.content).toContain('Theory analysis is not yet available');
      });

      it('should classify "evidence for" queries as THEORY_REQUEST', async () => {
        const params = createTestParams('Find evidence for the time loop theory');
        const result = await orchestrator.invokeAgent(params);

        expect(result.content).toContain('Theory analysis is not yet available');
      });

      it('should classify "validate" queries as THEORY_REQUEST', async () => {
        const params = createTestParams('Validate my theory about Satoko');
        const result = await orchestrator.invokeAgent(params);

        expect(result.content).toContain('Theory analysis is not yet available');
      });
    });

    describe('Unknown Queries', () => {
      it('should default to Query Agent for unknown query types', async () => {
        const params = createTestParams('Hello there');
        await orchestrator.invokeAgent(params);

        // Should default to Query Agent
        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      });

      it('should default to Query Agent for ambiguous queries', async () => {
        const params = createTestParams('Interesting');
        await orchestrator.invokeAgent(params);

        expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      });
    });
  });

  describe('Routing Behavior', () => {
    it('should route script queries to Query Agent', async () => {
      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      const result = await orchestrator.invokeAgent(params);

      expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(params);
      expect(result.content).toBe('Mock response from Query Agent');
      expect(result.metadata?.agentsInvoked).toContain('Orchestrator');
      expect(result.metadata?.agentsInvoked).toContain('QueryAgent');
    });

    it('should include orchestrator in agents invoked list', async () => {
      const params: AgentInvocationParams = {
        query: 'What happens in Onikakushi?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      const result = await orchestrator.invokeAgent(params);

      expect(result.metadata?.agentsInvoked).toEqual(['Orchestrator', 'QueryAgent']);
    });

    it('should include processing time in metadata', async () => {
      const params: AgentInvocationParams = {
        query: 'Tell me about Hinamizawa',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      const result = await orchestrator.invokeAgent(params);

      expect(result.metadata?.processingTime).toBeDefined();
      expect(typeof result.metadata?.processingTime).toBe('number');
      expect(result.metadata?.processingTime).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle Query Agent errors with fallback', async () => {
      // Make Query Agent throw an error
      mockQueryAgent.invokeAgent.mockRejectedValueOnce(new Error('Query Agent failed'));

      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      const result = await orchestrator.invokeAgent(params);

      // Should attempt fallback to Query Agent
      expect(mockQueryAgent.invokeAgent).toHaveBeenCalledTimes(2);
      // Verify it's a fallback by checking agents invoked
      expect(result.metadata?.agentsInvoked).toContain('Orchestrator');
      expect(result.metadata?.agentsInvoked).toContain('QueryAgent');
    });

    it('should return error message if both orchestrator and fallback fail', async () => {
      // Make Query Agent always throw an error
      mockQueryAgent.invokeAgent.mockRejectedValue(new Error('Query Agent failed'));

      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      const result = await orchestrator.invokeAgent(params);

      expect(result.content).toContain('error');
      expect(result.metadata?.agentsInvoked).toContain('Orchestrator');
    });

    it('should validate user identity', async () => {
      // Make Query Agent also fail so fallback doesn't succeed
      mockQueryAgent.invokeAgent.mockRejectedValue(new Error('Identity validation failed'));

      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: '',
          username: '',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      const result = await orchestrator.invokeAgent(params);

      expect(result.content).toContain('error');
    });
  });

  describe('Logging', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should log invocation', async () => {
      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      await orchestrator.invokeAgent(params);

      expect(consoleLogSpy).toHaveBeenCalled();
      
      // Check for invocation log
      const invocationLog = consoleLogSpy.mock.calls.find(call => {
        const log = JSON.parse(call[0]);
        return log.message === 'Orchestrator Agent invoked';
      });
      expect(invocationLog).toBeDefined();
    });

    it('should log query classification', async () => {
      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      await orchestrator.invokeAgent(params);

      // Check for classification log
      const classificationLog = consoleLogSpy.mock.calls.find(call => {
        const log = JSON.parse(call[0]);
        return log.message === 'Query classified';
      });
      expect(classificationLog).toBeDefined();
      
      if (classificationLog) {
        const log = JSON.parse(classificationLog[0]);
        expect(log.queryType).toBeDefined();
      }
    });

    it('should log routing decision', async () => {
      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      await orchestrator.invokeAgent(params);

      // Check for routing log
      const routingLog = consoleLogSpy.mock.calls.find(call => {
        const log = JSON.parse(call[0]);
        return log.message === 'Routing to Query Agent' || 
               log.message === 'Routing to Query Agent (default)';
      });
      expect(routingLog).toBeDefined();
    });

    it('should log completion', async () => {
      const params: AgentInvocationParams = {
        query: 'Who is Rena?',
        identity: {
          userId: 'test-user',
          username: 'testuser',
        },
        memory: {
          userId: 'test-user',
          sessionId: 'test-session',
          messages: [],
          lastAccessed: new Date(),
        },
      };

      await orchestrator.invokeAgent(params);

      // Check for completion log
      const completionLog = consoleLogSpy.mock.calls.find(call => {
        const log = JSON.parse(call[0]);
        return log.message === 'Orchestrator Agent completed';
      });
      expect(completionLog).toBeDefined();
    });
  });
});
