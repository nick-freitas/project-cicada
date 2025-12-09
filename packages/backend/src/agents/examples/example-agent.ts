/**
 * Example Agent Implementation
 * 
 * This is a simple example showing how to create an AgentCore agent
 * using the CICADA base classes.
 */

import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../base';

/**
 * Example agent that echoes user input with context
 */
export class ExampleAgent extends CICADAAgentBase {
  constructor() {
    super({
      name: 'CICADA-Example',
      description: 'Example agent for demonstration purposes',
      systemPrompt: `You are a helpful assistant that echoes user input with context.
      
Your responsibilities:
1. Acknowledge the user's input
2. Provide relevant context from conversation history
3. Be friendly and helpful`,
      modelId: 'amazon.nova-pro-v1:0',
      maxTokens: 1024,
      temperature: 0.7,
    });
  }

  /**
   * Invoke the agent with user query and context
   */
  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    const startTime = Date.now();

    try {
      // Validate identity
      this.validateIdentity(params.identity);

      // Log invocation
      this.logActivity('info', 'Example agent invoked', {
        userId: params.identity.userId,
        query: params.query.substring(0, 50),
      });

      // Extract conversation context
      const conversationContext = this.extractContext(params.memory);

      // Build prompt with context
      let prompt = params.query;
      if (conversationContext) {
        prompt = `Previous conversation:\n${conversationContext}\n\nCurrent query: ${params.query}`;
      }

      // Invoke the Strands Agent
      const response = await this.invoke(prompt);

      const processingTime = Date.now() - startTime;

      // Log success
      this.logActivity('info', 'Example agent completed', {
        userId: params.identity.userId,
        processingTime,
      });

      return {
        content: response,
        metadata: {
          agentsInvoked: ['ExampleAgent'],
          toolsUsed: [],
          processingTime,
        },
      };
    } catch (error) {
      // Log error
      this.logActivity('error', 'Example agent failed', {
        userId: params.identity.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: this.formatError(error as Error),
        metadata: {
          agentsInvoked: ['ExampleAgent'],
          toolsUsed: [],
          processingTime: Date.now() - startTime,
        },
      };
    }
  }
}

/**
 * Example usage:
 * 
 * ```typescript
 * const agent = new ExampleAgent();
 * 
 * const result = await agent.invokeAgent({
 *   query: 'Hello, how are you?',
 *   identity: {
 *     userId: 'user-123',
 *     username: 'john',
 *   },
 *   memory: {
 *     userId: 'user-123',
 *     sessionId: 'session-456',
 *     messages: [],
 *     lastAccessed: new Date(),
 *   },
 * });
 * 
 * console.log(result.content);
 * ```
 */
