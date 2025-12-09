/**
 * Tests for Sub-Agent Invocation Utilities
 * 
 * Tests the sub-agent invocation utilities including identity propagation,
 * memory context passing, execution trace logging, and error handling.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

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

import {
  invokeSubAgent,
  invokeSubAgentsSequentially,
  invokeSubAgentsInParallel,
  extractExecutionTrace,
  SubAgentInvocationContext,
  SubAgentInvocationResultWithTrace,
} from '../sub-agent-invocation';
import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../../base';
import { UserIdentity } from '../../types/identity';
import { ConversationMemory } from '../../types/memory';

/**
 * Mock agent for testing
 */
class MockAgent extends CICADAAgentBase {
  public invokedWith: AgentInvocationParams | null = null;
  public shouldFail: boolean = false;
  public responseContent: string = 'Mock response';

  constructor(name: string) {
    super({
      name,
      description: 'Mock agent for testing',
      systemPrompt: 'Mock system prompt',
    });
  }

  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    this.invokedWith = params;

    if (this.shouldFail) {
      throw new Error('Mock agent failure');
    }

    return {
      content: this.responseContent,
      metadata: {
        agentsInvoked: [this.agentName],
        toolsUsed: ['mockTool'],
        processingTime: 100,
      },
    };
  }
}

/**
 * Create mock identity for testing
 */
function createMockIdentity(): UserIdentity {
  return {
    userId: 'test-user-123',
    username: 'testuser',
    groups: ['users'],
    attributes: {},
  };
}

/**
 * Create mock memory for testing
 */
function createMockMemory(): ConversationMemory {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    messages: [
      {
        role: 'user',
        content: 'Previous message',
        timestamp: new Date(),
      },
    ],
    lastAccessed: new Date(),
  };
}

/**
 * Create mock invocation context
 */
function createMockContext(subAgentName: string): SubAgentInvocationContext {
  return {
    callingAgent: 'TestCallingAgent',
    subAgentName,
    identity: createMockIdentity(),
    memory: createMockMemory(),
    context: {
      testKey: 'testValue',
    },
  };
}

describe('Sub-Agent Invocation Utilities', () => {
  describe('invokeSubAgent', () => {
    it('should successfully invoke a sub-agent', async () => {
      // Requirement 7.1: Sub-agent invocation
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result).toBeDefined();
      expect(result.content).toBe('Mock response');
      expect(result.trace).toBeDefined();
      expect(result.trace.success).toBe(true);
      expect(result.trace.callingAgent).toBe('TestCallingAgent');
      expect(result.trace.subAgentName).toBe('MockSubAgent');
    });

    it('should propagate user identity to sub-agent', async () => {
      // Requirement 7.4: Identity propagation
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      const query = 'Test query';

      await invokeSubAgent(mockAgent, query, context);

      expect(mockAgent.invokedWith).toBeDefined();
      expect(mockAgent.invokedWith!.identity).toEqual(context.identity);
      expect(mockAgent.invokedWith!.identity.userId).toBe('test-user-123');
      expect(mockAgent.invokedWith!.identity.username).toBe('testuser');
    });

    it('should pass memory context to sub-agent', async () => {
      // Requirement 7.3: Memory context passing
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      const query = 'Test query';

      await invokeSubAgent(mockAgent, query, context);

      expect(mockAgent.invokedWith).toBeDefined();
      expect(mockAgent.invokedWith!.memory).toEqual(context.memory);
      expect(mockAgent.invokedWith!.memory.sessionId).toBe('test-session-456');
      expect(mockAgent.invokedWith!.memory.messages).toHaveLength(1);
    });

    it('should include execution trace in result', async () => {
      // Requirement 7.2: Execution trace logging
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result.trace).toBeDefined();
      expect(result.trace.traceId).toBeDefined();
      expect(result.trace.traceId).toMatch(/^trace-/);
      expect(result.trace.startTime).toBeInstanceOf(Date);
      expect(result.trace.endTime).toBeInstanceOf(Date);
      expect(result.trace.duration).toBeGreaterThan(0);
      expect(result.trace.success).toBe(true);
    });

    it('should handle sub-agent failures gracefully', async () => {
      // Requirement 7.5: Error handling for sub-agent failures
      const mockAgent = new MockAgent('MockSubAgent');
      mockAgent.shouldFail = true;

      const context = createMockContext('MockSubAgent');
      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result).toBeDefined();
      expect(result.content).toContain('encountered an error');
      expect(result.trace.success).toBe(false);
      expect(result.trace.error).toBe('Mock agent failure');
    });

    it('should reject invocation without user identity', async () => {
      // Requirement 7.4: Identity validation
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      context.identity = null as any; // Invalid identity

      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result.trace.success).toBe(false);
      expect(result.trace.error).toContain('identity is required');
    });

    it('should reject invocation without memory context', async () => {
      // Requirement 7.3: Memory validation
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      context.memory = null as any; // Invalid memory

      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result.trace.success).toBe(false);
      expect(result.trace.error).toContain('memory is required');
    });

    it('should pass additional context to sub-agent', async () => {
      // Requirement 7.1: Context passing
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      context.context = {
        customKey: 'customValue',
        anotherKey: 123,
      };

      const query = 'Test query';

      await invokeSubAgent(mockAgent, query, context);

      expect(mockAgent.invokedWith).toBeDefined();
      expect(mockAgent.invokedWith!.context).toBeDefined();
      expect(mockAgent.invokedWith!.context!.customKey).toBe('customValue');
      expect(mockAgent.invokedWith!.context!.anotherKey).toBe(123);
      expect(mockAgent.invokedWith!.context!.callingAgent).toBe('TestCallingAgent');
    });

    it('should use provided trace ID if available', async () => {
      // Requirement 7.2: Trace ID propagation
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      context.traceId = 'custom-trace-id-123';

      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result.trace.traceId).toBe('custom-trace-id-123');
    });

    it('should generate trace ID if not provided', async () => {
      // Requirement 7.2: Trace ID generation
      const mockAgent = new MockAgent('MockSubAgent');
      const context = createMockContext('MockSubAgent');
      delete context.traceId;

      const query = 'Test query';

      const result = await invokeSubAgent(mockAgent, query, context);

      expect(result.trace.traceId).toBeDefined();
      expect(result.trace.traceId).toMatch(/^trace-/);
    });
  });

  describe('invokeSubAgentsSequentially', () => {
    it('should invoke multiple sub-agents in sequence', async () => {
      // Requirement 7.1: Sequential sub-agent invocation
      const agent1 = new MockAgent('Agent1');
      agent1.responseContent = 'Response from Agent 1';

      const agent2 = new MockAgent('Agent2');
      agent2.responseContent = 'Response from Agent 2';

      const agent3 = new MockAgent('Agent3');
      agent3.responseContent = 'Response from Agent 3';

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
        { agent: agent3, name: 'Agent3' },
      ];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsSequentially(
        subAgents,
        'Initial query',
        context
      );

      expect(results).toHaveLength(3);
      expect(results[0].content).toBe('Response from Agent 1');
      expect(results[1].content).toBe('Response from Agent 2');
      expect(results[2].content).toBe('Response from Agent 3');

      // Verify that each agent received the previous agent's output
      expect(agent1.invokedWith!.query).toBe('Initial query');
      expect(agent2.invokedWith!.query).toBe('Response from Agent 1');
      expect(agent3.invokedWith!.query).toBe('Response from Agent 2');
    });

    it('should stop sequential invocation on failure', async () => {
      // Requirement 7.5: Error handling in sequential invocation
      const agent1 = new MockAgent('Agent1');
      agent1.responseContent = 'Response from Agent 1';

      const agent2 = new MockAgent('Agent2');
      agent2.shouldFail = true;

      const agent3 = new MockAgent('Agent3');

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
        { agent: agent3, name: 'Agent3' },
      ];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsSequentially(
        subAgents,
        'Initial query',
        context
      );

      // Should have results from agent1 and agent2 (failed), but not agent3
      expect(results).toHaveLength(2);
      expect(results[0].trace.success).toBe(true);
      expect(results[1].trace.success).toBe(false);

      // Agent3 should not have been invoked
      expect(agent3.invokedWith).toBeNull();
    });

    it('should use same trace ID for all sequential invocations', async () => {
      // Requirement 7.2: Trace ID consistency
      const agent1 = new MockAgent('Agent1');
      const agent2 = new MockAgent('Agent2');

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
      ];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsSequentially(
        subAgents,
        'Initial query',
        context
      );

      expect(results[0].trace.traceId).toBe(results[1].trace.traceId);
    });
  });

  describe('invokeSubAgentsInParallel', () => {
    it('should invoke multiple sub-agents in parallel', async () => {
      // Requirement 7.1: Parallel sub-agent invocation
      const agent1 = new MockAgent('Agent1');
      agent1.responseContent = 'Response from Agent 1';

      const agent2 = new MockAgent('Agent2');
      agent2.responseContent = 'Response from Agent 2';

      const agent3 = new MockAgent('Agent3');
      agent3.responseContent = 'Response from Agent 3';

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
        { agent: agent3, name: 'Agent3' },
      ];

      const queries = ['Query 1', 'Query 2', 'Query 3'];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsInParallel(subAgents, queries, context);

      expect(results).toHaveLength(3);
      expect(results[0].content).toBe('Response from Agent 1');
      expect(results[1].content).toBe('Response from Agent 2');
      expect(results[2].content).toBe('Response from Agent 3');

      // Verify that each agent received its corresponding query
      expect(agent1.invokedWith!.query).toBe('Query 1');
      expect(agent2.invokedWith!.query).toBe('Query 2');
      expect(agent3.invokedWith!.query).toBe('Query 3');
    });

    it('should handle failures in parallel invocation', async () => {
      // Requirement 7.5: Error handling in parallel invocation
      const agent1 = new MockAgent('Agent1');
      agent1.responseContent = 'Response from Agent 1';

      const agent2 = new MockAgent('Agent2');
      agent2.shouldFail = true;

      const agent3 = new MockAgent('Agent3');
      agent3.responseContent = 'Response from Agent 3';

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
        { agent: agent3, name: 'Agent3' },
      ];

      const queries = ['Query 1', 'Query 2', 'Query 3'];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsInParallel(subAgents, queries, context);

      // All agents should have been invoked, even if one failed
      expect(results).toHaveLength(3);
      expect(results[0].trace.success).toBe(true);
      expect(results[1].trace.success).toBe(false);
      expect(results[2].trace.success).toBe(true);
    });

    it('should throw error if agent count does not match query count', async () => {
      // Requirement 7.5: Input validation
      const agent1 = new MockAgent('Agent1');
      const agent2 = new MockAgent('Agent2');

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
      ];

      const queries = ['Query 1']; // Mismatch: 2 agents, 1 query

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      await expect(
        invokeSubAgentsInParallel(subAgents, queries, context)
      ).rejects.toThrow('Number of sub-agents must match number of queries');
    });

    it('should use same trace ID for all parallel invocations', async () => {
      // Requirement 7.2: Trace ID consistency
      const agent1 = new MockAgent('Agent1');
      const agent2 = new MockAgent('Agent2');

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
      ];

      const queries = ['Query 1', 'Query 2'];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsInParallel(subAgents, queries, context);

      expect(results[0].trace.traceId).toBe(results[1].trace.traceId);
    });
  });

  describe('extractExecutionTrace', () => {
    it('should format execution trace from results', async () => {
      // Requirement 7.2: Execution trace extraction
      const agent1 = new MockAgent('Agent1');
      const agent2 = new MockAgent('Agent2');

      const subAgents = [
        { agent: agent1, name: 'Agent1' },
        { agent: agent2, name: 'Agent2' },
      ];

      const context = {
        callingAgent: 'TestOrchestrator',
        identity: createMockIdentity(),
        memory: createMockMemory(),
      };

      const results = await invokeSubAgentsSequentially(
        subAgents,
        'Initial query',
        context
      );

      const trace = extractExecutionTrace(results);

      expect(trace).toContain('Execution Trace:');
      expect(trace).toContain('TestOrchestrator → Agent1');
      expect(trace).toContain('TestOrchestrator → Agent2');
      expect(trace).toContain('Duration:');
      expect(trace).toContain('Success: true');
      expect(trace).toContain('Agents Invoked:');
      expect(trace).toContain('Tools Used:');
    });

    it('should include error information in trace', async () => {
      // Requirement 7.2: Error trace formatting
      const agent1 = new MockAgent('Agent1');
      agent1.shouldFail = true;

      const context = createMockContext('Agent1');

      const result = await invokeSubAgent(agent1, 'Test query', context);

      const trace = extractExecutionTrace([result]);

      expect(trace).toContain('Success: false');
      expect(trace).toContain('Error: Mock agent failure');
    });
  });
});
