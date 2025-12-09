/**
 * Base Agent Class for AgentCore
 * 
 * This provides a foundation for all AgentCore agents in CICADA,
 * using the Strands SDK for agent orchestration.
 */

import { Agent, AgentConfig } from '@strands-agents/sdk';
import { UserIdentity } from '../types/identity';
import { ConversationMemory } from '../types/memory';

/**
 * Base configuration for CICADA agents
 */
export interface CICADAAgentConfig extends Partial<AgentConfig> {
  /**
   * Agent name (e.g., 'CICADA-Query', 'CICADA-Orchestrator')
   */
  name: string;

  /**
   * Agent description
   */
  description: string;

  /**
   * Bedrock model ID to use
   * @default 'amazon.nova-pro-v1:0'
   */
  modelId?: string;

  /**
   * System prompt for the agent
   */
  systemPrompt?: string;

  /**
   * Maximum tokens for response
   * @default 2048
   */
  maxTokens?: number;

  /**
   * Temperature for model inference
   * @default 0.7
   */
  temperature?: number;
}

/**
 * Parameters passed to agent invocation
 */
export interface AgentInvocationParams {
  /**
   * User query or input
   */
  query: string;

  /**
   * User identity for access control and data isolation
   */
  identity: UserIdentity;

  /**
   * Conversation memory for context
   */
  memory: ConversationMemory;

  /**
   * Additional context or parameters
   */
  context?: Record<string, any>;
}

/**
 * Result from agent invocation
 */
export interface AgentInvocationResult {
  /**
   * Agent response content
   */
  content: string;

  /**
   * Metadata about the invocation
   */
  metadata?: {
    /**
     * Agents invoked during processing
     */
    agentsInvoked?: string[];

    /**
     * Tools used during processing
     */
    toolsUsed?: string[];

    /**
     * Token usage
     */
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };

    /**
     * Processing time in milliseconds
     */
    processingTime?: number;
  };
}

/**
 * Base class for all CICADA AgentCore agents
 * 
 * Extends the Strands SDK Agent class with CICADA-specific functionality
 * including identity management, memory integration, and logging.
 */
export abstract class CICADAAgentBase extends Agent {
  protected readonly agentName: string;
  protected readonly agentDescription: string;

  constructor(config: CICADAAgentConfig) {
    // Initialize Strands Agent with Bedrock model
    super({
      systemPrompt: config.systemPrompt,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
      ...config,
    });

    this.agentName = config.name;
    this.agentDescription = config.description;
  }

  /**
   * Invoke the agent with CICADA-specific parameters
   * 
   * This method should be implemented by each specialized agent
   * to handle their specific logic.
   */
  abstract invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult>;

  /**
   * Validate user identity and enforce access control
   */
  protected validateIdentity(identity: UserIdentity): void {
    if (!identity.userId) {
      throw new Error('User identity is required');
    }

    if (!identity.username) {
      throw new Error('Username is required');
    }
  }

  /**
   * Log agent activity for debugging and monitoring
   */
  protected logActivity(
    level: 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, any>
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      agent: this.agentName,
      level,
      message,
      ...metadata,
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Extract relevant conversation context from memory
   */
  protected extractContext(memory: ConversationMemory): string {
    if (!memory.messages || memory.messages.length === 0) {
      return '';
    }

    // Get last 5 messages for context
    const recentMessages = memory.messages.slice(-5);

    return recentMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Format error for user-friendly display
   */
  protected formatError(error: Error): string {
    this.logActivity('error', 'Agent error occurred', {
      error: error.message,
      stack: error.stack,
    });

    return 'I encountered an error processing your request. Please try again or rephrase your question.';
  }
}
