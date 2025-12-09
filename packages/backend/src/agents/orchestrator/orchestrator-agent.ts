/**
 * Orchestrator Agent for AgentCore
 * 
 * Central coordinator with explicit routing logic. This agent uses deterministic
 * classification (keyword-based) to route queries to specialized agents.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../base';
import { QueryAgent } from '../query';
import { TheoryAgent } from '../theory';
import { ProfileAgent } from '../profile';

/**
 * Query classification types
 */
type QueryType = 'SCRIPT_QUERY' | 'THEORY_REQUEST' | 'PROFILE_REQUEST' | 'UNKNOWN';

/**
 * Orchestrator Agent Configuration
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `You are CICADA's Orchestrator Agent, the central coordinator for the multi-agent system.

Your responsibilities:
1. Route queries to the appropriate specialized agent
2. Coordinate multi-agent workflows
3. Maintain conversation context
4. Ensure consistent user experience

You work with these specialized agents:
- Query Agent: Script search and citation
- Theory Agent: Theory analysis and evidence gathering
- Profile Agent: Profile management (characters, locations, episodes, theories)

Always provide helpful, accurate responses based on the specialized agents' outputs.`;

/**
 * Orchestrator Agent
 * 
 * This agent provides deterministic routing to specialized agents based on
 * explicit classification logic. No autonomous decisions - all routing is
 * keyword-based and logged.
 */
export class OrchestratorAgent extends CICADAAgentBase {
  private queryAgent: QueryAgent;
  private theoryAgent: TheoryAgent;
  private profileAgent: ProfileAgent;

  constructor() {
    super({
      name: 'CICADA-Orchestrator',
      description: 'Central coordinator for CICADA multi-agent system',
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      modelId: 'us.amazon.nova-lite-v1:0',
      maxTokens: 2048,
      temperature: 0.7,
    });

    // Initialize specialized agents
    this.queryAgent = new QueryAgent();
    this.theoryAgent = new TheoryAgent();
    this.profileAgent = new ProfileAgent();

    this.logActivity('info', 'Orchestrator Agent initialized', {
      registeredAgents: ['QueryAgent', 'TheoryAgent', 'ProfileAgent'],
    });
  }

  /**
   * Invoke the Orchestrator Agent with explicit routing
   * 
   * This method uses deterministic classification to route queries to
   * the appropriate specialized agent.
   * 
   * Requirements:
   * - 3.1: Classify using explicit logic (not autonomous decision)
   * - 3.2: Route script content queries to Query Agent
   * - 3.3: Route profile queries to Profile Agent
   * - 3.4: Route theory queries to Theory Agent
   * - 3.5: Log all routing decisions
   */
  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    const startTime = Date.now();

    try {
      // Validate identity
      this.validateIdentity(params.identity);

      // Log invocation
      this.logActivity('info', 'Orchestrator Agent invoked', {
        userId: params.identity.userId,
        query: params.query.substring(0, 50),
      });

      // Requirement 3.1: Explicit classification logic (keyword-based)
      const queryType = this.classifyQuery(params.query);

      // Requirement 3.5: Log routing decision
      this.logActivity('info', 'Query classified', {
        userId: params.identity.userId,
        queryType,
        query: params.query.substring(0, 100),
      });

      // Requirement 3.2, 3.3, 3.4: Deterministic routing via switch statement
      let result: AgentInvocationResult;

      switch (queryType) {
        case 'SCRIPT_QUERY':
          // Requirement 3.2: Route script content queries to Query Agent
          this.logActivity('info', 'Routing to Query Agent', {
            userId: params.identity.userId,
            reason: 'Script content query detected',
          });
          result = await this.queryAgent.invokeAgent(params);
          break;

        case 'THEORY_REQUEST':
          // Requirement 3.4: Route theory queries to Theory Agent
          this.logActivity('info', 'Routing to Theory Agent', {
            userId: params.identity.userId,
            reason: 'Theory analysis query detected',
          });
          result = await this.theoryAgent.invokeAgent(params);
          break;

        case 'PROFILE_REQUEST':
          // Requirement 3.3: Route profile queries to Profile Agent
          this.logActivity('info', 'Routing to Profile Agent', {
            userId: params.identity.userId,
            reason: 'Profile management query detected',
          });
          result = await this.profileAgent.invokeAgent(params);
          break;

        case 'UNKNOWN':
        default:
          // Default to Query Agent for general questions
          this.logActivity('info', 'Routing to Query Agent (default)', {
            userId: params.identity.userId,
            reason: 'Query type unknown, defaulting to script search',
          });
          result = await this.queryAgent.invokeAgent(params);
          break;
      }

      const processingTime = Date.now() - startTime;

      // Log completion
      this.logActivity('info', 'Orchestrator Agent completed', {
        userId: params.identity.userId,
        queryType,
        processingTime,
      });

      // Add orchestrator to agents invoked list
      const agentsInvoked = ['Orchestrator', ...(result.metadata?.agentsInvoked || [])];

      return {
        ...result,
        metadata: {
          ...result.metadata,
          agentsInvoked,
          processingTime,
        },
      };
    } catch (error) {
      // Log error
      this.logActivity('error', 'Orchestrator Agent failed', {
        userId: params.identity.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Try to fallback to Query Agent
      try {
        this.logActivity('info', 'Attempting fallback to Query Agent', {
          userId: params.identity.userId,
        });

        const fallbackResult = await this.queryAgent.invokeAgent(params);

        return {
          ...fallbackResult,
          metadata: {
            ...fallbackResult.metadata,
            agentsInvoked: ['Orchestrator', 'QueryAgent'],
            processingTime: Date.now() - startTime,
          },
        };
      } catch (fallbackError) {
        // Both orchestrator and fallback failed
        this.logActivity('error', 'Fallback to Query Agent also failed', {
          userId: params.identity.userId,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
        });

        return {
          content: this.formatError(error as Error),
          metadata: {
            agentsInvoked: ['Orchestrator'],
            processingTime: Date.now() - startTime,
          },
        };
      }
    }
  }

  /**
   * Classify query using explicit keyword-based logic
   * 
   * Requirement 3.1: Explicit classification logic (not autonomous decision)
   * 
   * This method uses simple keyword matching to determine query type.
   * No LLM decision-making - purely deterministic.
   * 
   * @param query - User query
   * @returns Query type classification
   */
  private classifyQuery(query: string): QueryType {
    const lowerQuery = query.toLowerCase();

    // Profile request patterns
    // Requirement 3.3: Detect profile-related queries
    const profileKeywords = [
      'show me',
      'list',
      'my profile',
      'update profile',
      'save profile',
      'get profile',
      'view profile',
      'edit profile',
      'delete profile',
      'create profile',
      'profile for',
      'profiles',
    ];

    if (profileKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'PROFILE_REQUEST';
    }

    // Theory request patterns
    // Requirement 3.4: Detect theory-related queries
    const theoryKeywords = [
      'theory',
      'hypothesis',
      'evidence for',
      'validate',
      'analyze theory',
      'test theory',
      'theory about',
      'my theory',
      'theories',
    ];

    if (theoryKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'THEORY_REQUEST';
    }

    // Script query patterns (default)
    // Requirement 3.2: Detect script content queries
    const scriptKeywords = [
      'who is',
      'what is',
      'tell me about',
      'what happens',
      'when does',
      'where is',
      'why does',
      'how does',
      'explain',
      'describe',
      'what does',
      'who does',
    ];

    if (scriptKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'SCRIPT_QUERY';
    }

    // If no specific pattern matches, return UNKNOWN
    // The orchestrator will default to Query Agent for unknown queries
    return 'UNKNOWN';
  }

  /**
   * Format error for user-friendly display
   * 
   * @param error - Error object
   * @returns User-friendly error message
   */
  protected formatError(error: Error): string {
    this.logActivity('error', 'Orchestrator error occurred', {
      error: error.message,
      stack: error.stack,
    });

    return 'I encountered an error coordinating your request. Please try again or rephrase your question.';
  }
}
