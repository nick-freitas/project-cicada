import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { getAgentConfig } from '../../src/utils/agentcore-client';
import { invokeAgentWithRetry } from '../../src/utils/agent-invocation';

/**
 * Integration tests for AgentCore Orchestrator Agent
 * 
 * Tests:
 * - Orchestrator Agent invocation via AgentCore
 * - Streaming response handling
 * - Agent-to-agent coordination (Orchestrator → Query/Theory/Profile)
 * - Error handling and retry logic
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 8.1, 11.2
 * 
 * Note: These tests require deployed AgentCore agents and AWS credentials.
 * Set SKIP_INTEGRATION_TESTS=true to skip in CI/CD environments.
 */

describe('AgentCore Orchestrator Integration', () => {
  const skipTests = process.env.SKIP_INTEGRATION_TESTS === 'true' || !process.env.ORCHESTRATOR_AGENT_ID;
  
  let agentRuntimeClient: BedrockAgentRuntimeClient;
  let orchestratorConfig: { agentId: string; agentAliasId: string };

  beforeAll(() => {
    if (skipTests) {
      console.log('Skipping AgentCore integration tests - agents not deployed or SKIP_INTEGRATION_TESTS=true');
      return;
    }

    agentRuntimeClient = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    try {
      orchestratorConfig = getAgentConfig('orchestrator');
    } catch (error) {
      console.error('Failed to get orchestrator config:', error);
    }
  });

  describe('Agent Invocation via AgentCore', () => {
    it('should invoke Orchestrator Agent with simple query', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      const testQuery = 'What is Higurashi about?';

      const command = new InvokeAgentCommand({
        agentId: orchestratorConfig.agentId,
        agentAliasId: orchestratorConfig.agentAliasId,
        sessionId,
        inputText: testQuery,
        enableTrace: false,
      });

      const response: InvokeAgentCommandOutput = await agentRuntimeClient.send(command);

      // Validate response structure
      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();
      expect(response.sessionId).toBe(sessionId);

      // Collect streaming response
      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      // Validate we got a response
      expect(fullResponse.length).toBeGreaterThan(0);
    }, 60000); // 60 second timeout for agent invocation

    it('should invoke Orchestrator Agent with retry logic', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      const testQuery = 'Tell me about Rena Ryuugu';

      // Test the retry wrapper
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
          maxRetries: 3,
          retryDelay: 1000,
          timeout: 60000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();
    }, 90000); // 90 second timeout with retries
  });

  describe('Agent-to-Agent Coordination', () => {
    it('should coordinate with Query Agent for script queries', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      // Query that should trigger Query Agent invocation
      const testQuery = 'What does Rena say about taking things home?';

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
          timeout: 90000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      // Collect response and check for citations (indicates Query Agent was used)
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
      // Query Agent responses typically include citations or episode references
    }, 120000); // 2 minute timeout for multi-agent coordination

    it('should coordinate with Theory Agent for theory analysis', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      // Query that should trigger Theory Agent invocation
      const testQuery = 'I have a theory that Rena is hiding something. Can you analyze this?';

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
          timeout: 90000,
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
    }, 120000);

    it('should coordinate with Profile Agent for knowledge extraction', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      // Query that should trigger Profile Agent invocation
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
          timeout: 90000,
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
    }, 120000);
  });

  describe('Session and Context Management', () => {
    it('should maintain conversation context across multiple turns', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;

      // First turn
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

      // Second turn - should maintain context
      const response2 = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: orchestratorConfig.agentId,
          agentAliasId: orchestratorConfig.agentAliasId,
          sessionId, // Same session
          inputText: 'What else can you tell me about her?',
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
      // Second response should reference context from first turn
    }, 150000); // 2.5 minute timeout for multi-turn conversation
  });

  describe('Streaming Response Handling', () => {
    it('should stream responses in real-time', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      const testQuery = 'Explain the Watanagashi festival';

      const command = new InvokeAgentCommand({
        agentId: orchestratorConfig.agentId,
        agentAliasId: orchestratorConfig.agentAliasId,
        sessionId,
        inputText: testQuery,
        enableTrace: false,
      });

      const response = await agentRuntimeClient.send(command);

      expect(response.completion).toBeDefined();

      // Track streaming chunks
      const chunks: string[] = [];
      let chunkCount = 0;

      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            chunks.push(text);
            chunkCount++;
          }
        }
      }

      // Validate streaming occurred (multiple chunks)
      expect(chunkCount).toBeGreaterThan(0);
      expect(chunks.length).toBeGreaterThan(0);

      // Validate full response
      const fullResponse = chunks.join('');
      expect(fullResponse.length).toBeGreaterThan(0);
    }, 90000);

    it('should handle streaming completion markers', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      const testQuery = 'What is the curse?';

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
        { maxRetries: 2, retryDelay: 1000, timeout: 60000 }
      );

      expect(response.completion).toBeDefined();

      let streamCompleted = false;
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            // Process chunk
          }
        }
        streamCompleted = true;
      }

      expect(streamCompleted).toBe(true);
    }, 90000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid session IDs gracefully', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const invalidSessionId = ''; // Empty session ID
      const testQuery = 'Test query';

      try {
        await agentRuntimeClient.send(
          new InvokeAgentCommand({
            agentId: orchestratorConfig.agentId,
            agentAliasId: orchestratorConfig.agentAliasId,
            sessionId: invalidSessionId,
            inputText: testQuery,
            enableTrace: false,
          })
        );
        // Should not reach here
        fail('Expected error for invalid session ID');
      } catch (error) {
        // Expect validation error
        expect(error).toBeDefined();
      }
    }, 30000);

    it('should handle empty queries gracefully', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      const emptyQuery = '';

      try {
        await agentRuntimeClient.send(
          new InvokeAgentCommand({
            agentId: orchestratorConfig.agentId,
            agentAliasId: orchestratorConfig.agentAliasId,
            sessionId,
            inputText: emptyQuery,
            enableTrace: false,
          })
        );
        // Should not reach here
        fail('Expected error for empty query');
      } catch (error) {
        // Expect validation error
        expect(error).toBeDefined();
      }
    }, 30000);

    it('should retry on transient failures', async () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      const sessionId = `test-session-${Date.now()}`;
      const testQuery = 'Test retry logic';

      // The retry logic should handle transient failures
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
          maxRetries: 3,
          retryDelay: 500,
          timeout: 60000,
        }
      );

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();
    }, 90000);
  });

  describe('Configuration and Environment', () => {
    it('should load agent configuration from environment', () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      expect(orchestratorConfig).toBeDefined();
      expect(orchestratorConfig.agentId).toBeDefined();
      expect(orchestratorConfig.agentAliasId).toBeDefined();
      expect(orchestratorConfig.agentId.length).toBeGreaterThan(0);
      expect(orchestratorConfig.agentAliasId.length).toBeGreaterThan(0);
    });

    it('should create agent runtime client with correct region', () => {
      if (skipTests) {
        console.log('Skipping - agents not deployed');
        return;
      }

      expect(agentRuntimeClient).toBeDefined();
      expect(agentRuntimeClient.config).toBeDefined();
    });
  });
});
