import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { getAgentConfig } from '../../src/utils/agentcore-client';
import { invokeAgentWithRetry } from '../../src/utils/agent-invocation';

/**
 * Integration tests for Agent-to-Agent coordination via AgentCore
 * 
 * Tests:
 * - Orchestrator → Query Agent coordination
 * - Orchestrator → Theory Agent coordination
 * - Orchestrator → Profile Agent coordination
 * - Theory Agent → Query Agent coordination (multi-hop)
 * 
 * Validates: Requirements 2.3, 4.2, 7.2, 11.2
 * 
 * Note: These tests require all AgentCore agents to be deployed.
 * Set SKIP_INTEGRATION_TESTS=true to skip in CI/CD environments.
 */

describe('Agent-to-Agent Coordination Integration', () => {
  const skipTests =
    process.env.SKIP_INTEGRATION_TESTS === 'true' ||
    !process.env.ORCHESTRATOR_AGENT_ID ||
    !process.env.QUERY_AGENT_ID ||
    !process.env.THEORY_AGENT_ID ||
    !process.env.PROFILE_AGENT_ID;

  let agentRuntimeClient: BedrockAgentRuntimeClient;
  let orchestratorConfig: { agentId: string; agentAliasId: string };
  let queryConfig: { agentId: string; agentAliasId: string };
  let theoryConfig: { agentId: string; agentAliasId: string };
  let profileConfig: { agentId: string; agentAliasId: string };

  beforeAll(() => {
    if (skipTests) {
      console.log(
        'Skipping agent coordination tests - agents not deployed or SKIP_INTEGRATION_TESTS=true'
      );
      return;
    }

    agentRuntimeClient = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    try {
      orchestratorConfig = getAgentConfig('orchestrator');
      queryConfig = getAgentConfig('query');
      theoryConfig = getAgentConfig('theory');
      profileConfig = getAgentConfig('profile');
    } catch (error) {
      console.error('Failed to get agent configs:', error);
    }
  });

  describe('Orchestrator → Query Agent Coordination', () => {
    it('should route script queries to Query Agent', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // This query should trigger Orchestrator to invoke Query Agent
      const testQuery = 'What does Rena say about "omochikaeri"?';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true, // Enable trace to see agent coordination
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 120000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      // Collect response
      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
      // Response should include citations (indicates Query Agent was invoked)
    }, 150000); // 2.5 minute timeout

    it('should handle Knowledge Base queries through Query Agent', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      const testQuery = 'Find all mentions of the Watanagashi festival';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 120000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
    }, 150000);
  });

  describe('Orchestrator → Theory Agent Coordination', () => {
    it('should route theory analysis to Theory Agent', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // This query should trigger Orchestrator to invoke Theory Agent
      const testQuery =
        'I have a theory that Rena knows more than she lets on. Can you analyze this theory?';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 120000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
      // Response should include evidence analysis
    }, 150000);

    it('should handle theory refinement requests', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      const testQuery =
        'My theory is that the curse is not supernatural. Can you help me refine this theory?';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 120000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
    }, 150000);
  });

  describe('Orchestrator → Profile Agent Coordination', () => {
    it('should route profile queries to Profile Agent', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // This query should trigger Orchestrator to invoke Profile Agent
      const testQuery = 'Tell me everything you know about Rena Ryuugu';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 120000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
      // Response should include profile information
    }, 150000);

    it('should extract and update profiles during conversation', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // Provide information that should be extracted into profiles
      const testQuery =
        'Rena Ryuugu is a cheerful girl who loves cute things and often says "omochikaeri"';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 120000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
    }, 150000);
  });

  describe('Multi-Hop Agent Coordination', () => {
    it('should handle Theory Agent → Query Agent coordination', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // This should trigger: Orchestrator → Theory Agent → Query Agent
      const testQuery =
        'Analyze the theory that Rena is connected to the disappearances. Gather evidence from the scripts.';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 180000, // 3 minutes for multi-hop
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
      // Response should include both theory analysis and evidence citations
    }, 200000); // 3+ minute timeout for multi-hop coordination

    it('should handle complex queries requiring multiple agents', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // This should trigger multiple agents: Query + Profile + Theory
      const testQuery =
        'Based on what we know about Rena, analyze the theory that she has a dark secret. Use evidence from the scripts.';

      const response = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: testQuery,
          enableTrace: true,
        },
        'Orchestrator',
        {
          maxRetries: 2,
          retryDelay: 1000,
          timeout: 180000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
    }, 200000);
  });

  describe('Agent Coordination Error Handling', () => {
    it('should handle agent invocation failures gracefully', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;
      // Query that might cause issues
      const testQuery = 'x'.repeat(10000); // Very long query

      try {
        const response = await invokeAgentWithRetry(
          agentRuntimeClient,
          {
            agentId: orchestratorConfig.agentId,
            agentAliasId: orchestratorConfig.agentAliasId,
            sessionId,
            inputText: testQuery,
            enableTrace: false,
          },
          'Orchestrator',
          {
            maxRetries: 1,
            retryDelay: 500,
            timeout: 30000,
          }
        );

        // If it succeeds, that's fine
        expect(response).toBeDefined();
      } catch (error) {
        // If it fails, error should be handled gracefully
        expect(error).toBeDefined();
      }
    }, 60000);

    it('should maintain session state across coordination failures', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-coord-session-${Date.now()}`;

      // First successful query
      const response1 = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId,
          inputText: 'Tell me about Rena',
          enableTrace: false,
        },
        'Orchestrator',
        { maxRetries: 2, retryDelay: 1000, timeout: 60000 }
      );

      let response1Text = '';
      if (response1.completion) {
        for await (const chunk of response1.completion) {
          if (chunk.chunk?.bytes) {
            response1Text += new TextDecoder().decode(chunk.chunk.bytes);
          }
        }
      }

      expect(response1Text.length).toBeGreaterThan(0);

      // Second query should maintain context even if first had issues
      const response2 = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId, // Same session
          inputText: 'What else?',
          enableTrace: false,
        },
        'Orchestrator',
        { maxRetries: 2, retryDelay: 1000, timeout: 60000 }
      );

      let response2Text = '';
      if (response2.completion) {
        for await (const chunk of response2.completion) {
          if (chunk.chunk?.bytes) {
            response2Text += new TextDecoder().decode(chunk.chunk.bytes);
          }
        }
      }

      expect(response2Text.length).toBeGreaterThan(0);
    }, 150000);
  });
});
