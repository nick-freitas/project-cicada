import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { queryAgent, QueryAgentRequest } from './query-agent';
import { theoryAgent, TheoryAgentRequest } from './theory-agent';
import { profileAgent, ProfileAgentRequest } from './profile-agent';
import { memoryService } from '../services/memory-service';
import { logger } from '../utils/logger';

const MODEL_ID = process.env.MODEL_ID || 'amazon.nova-lite-v1:0';

export interface OrchestratorRequest {
  userId: string;
  query: string;
  sessionId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
}

export interface OrchestratorResponse {
  content: string;
  citations?: any[];
  profileUpdates?: any[];
  agentsInvoked: string[];
}

export type StreamChunk = {
  type: 'chunk' | 'complete' | 'error';
  content?: string;
  error?: string;
};

/**
 * Orchestrator Agent (CICADA Arbiter) - Central coordinator and conversation manager
 * 
 * Responsibilities:
 * - Query intent classification
 * - Agent routing and coordination
 * - Context management across agents
 * - Response aggregation and streaming
 * - Conversation coherence
 */
export class OrchestratorAgent {
  private bedrockClient: BedrockRuntimeClient;

  constructor(bedrockClient?: BedrockRuntimeClient) {
    this.bedrockClient = bedrockClient || new BedrockRuntimeClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
  }

  /**
   * Process a user query by coordinating specialized agents
   */
  async processQuery(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    try {
      logger.info('Orchestrator processing query', {
        userId: request.userId,
        sessionId: request.sessionId,
        queryLength: request.query.length,
      });

      // Step 1: Retrieve conversation context
      const session = await memoryService.getSession(request.userId, request.sessionId);
      const conversationContext = session
        ? session.messages.map(m => `${m.role}: ${m.content}`).join('\n')
        : '';

      // Step 2: Analyze query intent
      const intent = await this.analyzeIntent(request.query, conversationContext);

      logger.info('Query intent analyzed', {
        userId: request.userId,
        intent: intent.primaryIntent,
        agentsNeeded: intent.agentsNeeded,
      });

      // Step 3: Coordinate agent invocations
      const agentResults = await this.coordinateAgents(request, intent);

      // Step 4: Aggregate results and generate response
      const response = await this.aggregateResponse(request, intent, agentResults);

      // Step 5: Store conversation turn
      await memoryService.addMessage(request.userId, request.sessionId, {
        role: 'user',
        content: request.query,
        timestamp: new Date().toISOString(),
      });

      await memoryService.addMessage(request.userId, request.sessionId, {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        citations: response.citations,
        profileUpdates: response.profileUpdates,
      });

      logger.info('Orchestrator completed query', {
        userId: request.userId,
        agentsInvoked: response.agentsInvoked,
        citationCount: response.citations?.length || 0,
      });

      return response;
    } catch (error) {
      logger.error('Error in Orchestrator', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Process query with streaming response
   */
  async *processQueryStream(request: OrchestratorRequest): AsyncGenerator<StreamChunk> {
    try {
      logger.info('Orchestrator processing query with streaming', {
        userId: request.userId,
        sessionId: request.sessionId,
      });

      // Step 1: Retrieve conversation context
      const session = await memoryService.getSession(request.userId, request.sessionId);
      const conversationContext = session
        ? session.messages.map(m => `${m.role}: ${m.content}`).join('\n')
        : '';

      // Step 2: Analyze query intent
      const intent = await this.analyzeIntent(request.query, conversationContext);

      yield {
        type: 'chunk',
        content: `[Analyzing query: ${intent.primaryIntent}]\n\n`,
      };

      // Step 3: Coordinate agent invocations
      const agentResults = await this.coordinateAgents(request, intent);

      // Step 4: Stream aggregated response
      yield* this.streamAggregatedResponse(request, intent, agentResults);

      // Step 5: Store conversation turn
      const fullResponse = agentResults.map(r => r.content).join('\n\n');
      
      await memoryService.addMessage(request.userId, request.sessionId, {
        role: 'user',
        content: request.query,
        timestamp: new Date().toISOString(),
      });

      await memoryService.addMessage(request.userId, request.sessionId, {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });

      yield { type: 'complete' };

      logger.info('Orchestrator completed streaming', {
        userId: request.userId,
      });
    } catch (error) {
      logger.error('Error in Orchestrator streaming', { error, userId: request.userId });
      yield {
        type: 'error',
        error: 'An error occurred while processing your query.',
      };
    }
  }

  /**
   * Analyze query intent to determine which agents to invoke
   */
  private async analyzeIntent(
    query: string,
    conversationContext: string
  ): Promise<QueryIntent> {
    const systemPrompt = `You are analyzing user queries to determine which specialized agents should handle them.

Available agents:
- Query Agent: Searches script data, provides citations, analyzes linguistic nuances
- Theory Agent: Analyzes theories, gathers evidence, suggests refinements
- Profile Agent: Extracts and manages information about characters, locations, episodes

Analyze the query and determine:
1. Primary intent (query_script, analyze_theory, manage_profile, general_conversation)
2. Which agents are needed (can be multiple)
3. Any specific parameters (episode context, character names, etc.)

Format your response as JSON:
{
  "primaryIntent": "query_script|analyze_theory|manage_profile|general_conversation",
  "agentsNeeded": ["query", "theory", "profile"],
  "parameters": {
    "episodeContext": ["episode1", "episode2"],
    "characterNames": ["character1"],
    "theoryRelated": true
  },
  "reasoning": "Brief explanation"
}`;

    const userPrompt = `Query: ${query}

Recent conversation context:
${conversationContext}

Analyze this query and determine the intent and required agents.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback to query agent for general queries
        return {
          primaryIntent: 'query_script',
          agentsNeeded: ['query'],
          parameters: {},
          reasoning: 'Default fallback',
        };
      }

      const intent = JSON.parse(jsonMatch[0]);
      return intent;
    } catch (error) {
      logger.error('Error analyzing intent', { error });
      // Fallback
      return {
        primaryIntent: 'query_script',
        agentsNeeded: ['query'],
        parameters: {},
        reasoning: 'Error fallback',
      };
    }
  }

  /**
   * Coordinate invocations of specialized agents based on intent
   */
  private async coordinateAgents(
    request: OrchestratorRequest,
    intent: QueryIntent
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    // Always invoke Profile Agent first to get context
    if (intent.agentsNeeded.includes('profile') || intent.agentsNeeded.includes('query')) {
      try {
        const profileRequest: ProfileAgentRequest = {
          userId: request.userId,
          conversationContext: request.query,
          extractionMode: 'auto',
        };

        const profileResult = await profileAgent.extractAndUpdateProfiles(profileRequest);
        results.push({
          agent: 'profile',
          content: JSON.stringify(profileResult.extractedInformation),
          data: profileResult,
        });
      } catch (error) {
        logger.error('Error invoking Profile Agent', { error });
      }
    }

    // Invoke Query Agent if needed
    if (intent.agentsNeeded.includes('query')) {
      try {
        const queryRequest: QueryAgentRequest = {
          query: request.query,
          userId: request.userId,
          episodeContext: request.episodeContext || intent.parameters.episodeContext,
          fragmentGroup: request.fragmentGroup,
        };

        const queryResult = await queryAgent.processQuery(queryRequest);
        results.push({
          agent: 'query',
          content: queryResult.content,
          data: queryResult,
        });
      } catch (error) {
        logger.error('Error invoking Query Agent', { error });
      }
    }

    // Invoke Theory Agent if needed
    if (intent.agentsNeeded.includes('theory')) {
      try {
        const theoryRequest: TheoryAgentRequest = {
          userId: request.userId,
          theoryDescription: request.query,
          episodeContext: request.episodeContext || intent.parameters.episodeContext,
          fragmentGroup: request.fragmentGroup,
        };

        const theoryResult = await theoryAgent.analyzeTheory(theoryRequest);
        results.push({
          agent: 'theory',
          content: theoryResult.analysis,
          data: theoryResult,
        });
      } catch (error) {
        logger.error('Error invoking Theory Agent', { error });
      }
    }

    // Invoke Profile Agent again for extraction if needed
    if (intent.agentsNeeded.includes('profile') && results.length > 0) {
      try {
        const profileRequest: ProfileAgentRequest = {
          userId: request.userId,
          conversationContext: request.query + '\n\n' + results.map(r => r.content).join('\n'),
          extractionMode: 'explicit',
        };

        const profileResult = await profileAgent.extractAndUpdateProfiles(profileRequest);
        
        // Update or add profile result
        const existingProfileIndex = results.findIndex(r => r.agent === 'profile');
        if (existingProfileIndex >= 0) {
          results[existingProfileIndex] = {
            agent: 'profile',
            content: JSON.stringify(profileResult.extractedInformation),
            data: profileResult,
          };
        } else {
          results.push({
            agent: 'profile',
            content: JSON.stringify(profileResult.extractedInformation),
            data: profileResult,
          });
        }
      } catch (error) {
        logger.error('Error invoking Profile Agent for extraction', { error });
      }
    }

    return results;
  }

  /**
   * Aggregate results from specialized agents into coherent response
   */
  private async aggregateResponse(
    request: OrchestratorRequest,
    intent: QueryIntent,
    agentResults: AgentResult[]
  ): Promise<OrchestratorResponse> {
    const systemPrompt = `You are CICADA, an AI assistant for analyzing "Higurashi no Naku Koro Ni".

Your role is to synthesize information from specialized agents into a coherent, helpful response.

Guidelines:
- Maintain conversation coherence
- Cite sources when making claims
- Respect episode boundaries
- Be clear about speculation vs. evidence
- Provide helpful, engaging responses

Agent results are provided below. Synthesize them into a natural response.`;

    const agentSummary = agentResults
      .map(r => `${r.agent.toUpperCase()} Agent:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `User query: ${request.query}

Agent results:
${agentSummary}

Synthesize these results into a coherent response for the user.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const content = response.output?.message?.content?.[0]?.text || '';

      // Extract citations and profile updates from agent results
      const citations: any[] = [];
      const profileUpdates: any[] = [];
      const agentsInvoked: string[] = [];

      for (const result of agentResults) {
        agentsInvoked.push(result.agent);
        
        if (result.data?.citations) {
          citations.push(...result.data.citations);
        }
        
        if (result.data?.profileUpdates) {
          profileUpdates.push(...result.data.profileUpdates);
        }
      }

      return {
        content,
        citations,
        profileUpdates,
        agentsInvoked,
      };
    } catch (error) {
      logger.error('Error aggregating response', { error });
      
      // Fallback: return raw agent results
      return {
        content: agentResults.map(r => r.content).join('\n\n'),
        citations: [],
        profileUpdates: [],
        agentsInvoked: agentResults.map(r => r.agent),
      };
    }
  }

  /**
   * Stream aggregated response
   */
  private async *streamAggregatedResponse(
    request: OrchestratorRequest,
    intent: QueryIntent,
    agentResults: AgentResult[]
  ): AsyncGenerator<StreamChunk> {
    const systemPrompt = `You are CICADA, an AI assistant for analyzing "Higurashi no Naku Koro Ni".

Your role is to synthesize information from specialized agents into a coherent, helpful response.

Guidelines:
- Maintain conversation coherence
- Cite sources when making claims
- Respect episode boundaries
- Be clear about speculation vs. evidence
- Provide helpful, engaging responses

Agent results are provided below. Synthesize them into a natural response.`;

    const agentSummary = agentResults
      .map(r => `${r.agent.toUpperCase()} Agent:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `User query: ${request.query}

Agent results:
${agentSummary}

Synthesize these results into a coherent response for the user.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const content = response.output?.message?.content?.[0]?.text || '';

      // Stream the content in chunks
      const chunkSize = 50;
      for (let i = 0; i < content.length; i += chunkSize) {
        yield {
          type: 'chunk',
          content: content.slice(i, i + chunkSize),
        };
      }
    } catch (error) {
      logger.error('Error streaming aggregated response', { error });
      
      // Fallback: stream raw agent results
      for (const result of agentResults) {
        yield {
          type: 'chunk',
          content: `\n\n[${result.agent.toUpperCase()}]\n${result.content}\n`,
        };
      }
    }
  }
}

// Supporting interfaces
interface QueryIntent {
  primaryIntent: 'query_script' | 'analyze_theory' | 'manage_profile' | 'general_conversation';
  agentsNeeded: string[];
  parameters: {
    episodeContext?: string[];
    characterNames?: string[];
    theoryRelated?: boolean;
    [key: string]: any;
  };
  reasoning: string;
}

interface AgentResult {
  agent: string;
  content: string;
  data?: any;
}

// Export singleton instance
export const orchestratorAgent = new OrchestratorAgent();
