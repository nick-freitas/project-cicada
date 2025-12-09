/**
 * Query Agent for AgentCore
 * 
 * Specialized agent for script search and citation. This agent ALWAYS invokes
 * semantic search (deterministic behavior) and formats results with complete citations.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../base';
import { SemanticSearchTool } from './semantic-search-tool';
import { SearchResult } from '../../services/knowledge-base-service';

/**
 * Query Agent Configuration
 */
const QUERY_AGENT_SYSTEM_PROMPT = `You are CICADA's Query Agent, specialized in analyzing Higurashi script content.

Your responsibilities:
1. Base responses STRICTLY on provided script passages
2. Cite specific episodes, chapters, and speakers
3. If no passages are found, state so honestly - never hallucinate
4. Maintain episode boundaries - don't mix information from different arcs
5. Be conversational but accurate

Always ground your responses in the script evidence provided.`;

/**
 * Query Agent
 * 
 * This agent provides deterministic script search with citation formatting.
 * It ALWAYS invokes semantic search for every query - no autonomous decisions.
 */
export class QueryAgent extends CICADAAgentBase {
  private searchTool: SemanticSearchTool;

  constructor() {
    super({
      name: 'CICADA-Query',
      description: 'Script search and citation specialist',
      systemPrompt: QUERY_AGENT_SYSTEM_PROMPT,
      modelId: 'us.amazon.nova-lite-v1:0',
      maxTokens: 2048,
      temperature: 0.7,
    });

    // Initialize semantic search tool
    this.searchTool = new SemanticSearchTool();
  }

  /**
   * Invoke the Query Agent with deterministic search
   * 
   * This method ALWAYS invokes semantic search - no autonomous decision making.
   */
  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    const startTime = Date.now();

    try {
      // Validate identity
      this.validateIdentity(params.identity);

      // Log invocation
      this.logActivity('info', 'Query Agent invoked', {
        userId: params.identity.userId,
        query: params.query.substring(0, 50),
      });

      // ALWAYS invoke semantic search (deterministic behavior)
      // Requirement 2.1, 2.2: Explicitly invoke search tool
      const searchResult = await this.searchTool.execute(
        {
          query: params.query,
          topK: 20,
          minScore: 0.5,
          maxEmbeddingsToLoad: 3000,
        },
        {
          userId: params.identity.userId,
          sessionId: params.memory.sessionId,
        }
      );

      if (!searchResult.success || !searchResult.data) {
        throw new Error('Search tool execution failed');
      }

      const { results } = searchResult.data;

      this.logActivity('info', 'Search completed', {
        resultCount: results.length,
        topScore: results[0]?.score,
      });

      // Format search results with citations
      // Requirement 2.3: Format with complete citations
      const context = this.formatSearchResults(results);

      // Build prompt with explicit instructions
      const conversationContext = this.extractContext(params.memory);
      let userPrompt = `${context}\n\nUser question: ${params.query}\n\n`;
      userPrompt += `Based on the script passages above, answer the question with citations.`;

      if (conversationContext) {
        userPrompt = `Previous conversation:\n${conversationContext}\n\n${userPrompt}`;
      }

      // Invoke LLM with context
      const agentResult = await this.invoke(userPrompt);

      const processingTime = Date.now() - startTime;

      // Extract text content from agent result
      // AgentResult.toString() concatenates all text from TextBlock and ReasoningBlock
      const responseContent = agentResult.toString();

      // Log success
      this.logActivity('info', 'Query Agent completed', {
        userId: params.identity.userId,
        processingTime,
      });

      return {
        content: responseContent,
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
          processingTime,
        },
      };
    } catch (error) {
      // Log error
      this.logActivity('error', 'Query Agent failed', {
        userId: params.identity.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: this.formatError(error as Error),
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Format search results with complete citations
   * 
   * Requirement 2.3: Include episode name, chapter ID, message ID, speaker, and text
   * Requirement 2.4: Honestly state when no results are found
   */
  private formatSearchResults(results: SearchResult[]): string {
    // Requirement 2.4: No hallucination on empty results
    if (results.length === 0) {
      return 'No relevant passages found in the script for this query.';
    }

    let context = 'Here are relevant passages from the Higurashi script:\n\n';

    // Format top 10 results with complete citations
    results.slice(0, 10).forEach((result, idx) => {
      context += `[${idx + 1}] Episode: ${result.episodeName}, `;
      context += `Chapter: ${result.chapterId}, Message: ${result.messageId}\n`;

      if (result.speaker) {
        context += `Speaker: ${result.speaker}\n`;
      }

      context += `Text: ${result.textENG}\n`;
      context += `Relevance: ${(result.score * 100).toFixed(1)}%\n\n`;
    });

    return context;
  }

  /**
   * Format error for user-friendly display
   * 
   * Requirement 2.5: Honest error messages
   */
  protected formatError(error: Error): string {
    this.logActivity('error', 'Query Agent error occurred', {
      error: error.message,
      stack: error.stack,
    });

    return 'I encountered an error searching the script. Please try again.';
  }
}
