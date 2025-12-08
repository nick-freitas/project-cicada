import { 
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { semanticSearch, SearchOptions, SearchResult } from '../../services/knowledge-base-service';
import { Citation } from '@cicada/shared-types';
import { logger } from '../../utils/logger';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const MODEL_ID = process.env.MODEL_ID || 'amazon.nova-lite-v1:0';

/**
 * Query Agent Tool Handlers
 * 
 * These handlers implement the tools available to the Query Agent:
 * - search_knowledge_base: Semantic search over script data
 * - format_citation: Format search results as complete citations
 * - analyze_nuance: Analyze Japanese/English linguistic differences
 * 
 * Requirement 3.4: Implement tool handlers for semantic search integration
 */

export interface SearchKnowledgeBaseInput {
  query: string;
  episodeIds?: string[];
  topK?: number;
  minScore?: number;
}

export interface FormatCitationInput {
  episodeId: string;
  episodeName: string;
  chapterId: string;
  messageId: number;
  speaker?: string;
  textENG: string;
  textJPN?: string;
}

export interface AnalyzeNuanceInput {
  textJPN: string;
  textENG: string;
  episodeId: string;
  messageId: number;
}

/**
 * Tool: search_knowledge_base
 * Performs semantic search over the Higurashi script Knowledge Base
 * 
 * Property 11: Episode Boundary Enforcement
 * Property 19: Character-Focused Retrieval
 */
export async function searchKnowledgeBase(input: SearchKnowledgeBaseInput): Promise<SearchResult[]> {
  try {
    logger.info('Query Agent Tool: search_knowledge_base', {
      query: input.query.substring(0, 100),
      episodeIds: input.episodeIds,
      topK: input.topK,
    });

    const searchOptions: SearchOptions = {
      episodeIds: input.episodeIds,
      topK: input.topK || 20,
      minScore: input.minScore || 0.7,
    };

    // Perform semantic search with episode boundary enforcement
    const results = await semanticSearch(input.query, searchOptions);

    logger.info('Search completed', {
      resultCount: results.length,
      episodeIds: input.episodeIds,
    });

    return results;
  } catch (error) {
    logger.error('Error in search_knowledge_base tool', { error, input });
    throw error;
  }
}

/**
 * Tool: format_citation
 * Formats a search result as a complete citation with all required metadata
 * 
 * Property 8: Citation Completeness
 */
export async function formatCitation(input: FormatCitationInput): Promise<Citation> {
  try {
    logger.info('Query Agent Tool: format_citation', {
      episodeId: input.episodeId,
      messageId: input.messageId,
    });

    // Ensure all required fields are present
    const citation: Citation = {
      episodeId: input.episodeId,
      episodeName: input.episodeName,
      chapterId: input.chapterId,
      messageId: input.messageId,
      speaker: input.speaker,
      textENG: input.textENG,
      textJPN: input.textJPN,
    };

    // Validate citation completeness
    if (!citation.episodeId || !citation.episodeName || !citation.chapterId || 
        citation.messageId === undefined || !citation.textENG) {
      throw new Error('Incomplete citation: missing required fields');
    }

    return citation;
  } catch (error) {
    logger.error('Error in format_citation tool', { error, input });
    throw error;
  }
}

/**
 * Tool: analyze_nuance
 * Analyzes linguistic nuances between Japanese and English text
 * 
 * Identifies significant differences in meaning, tone, or cultural context
 */
export async function analyzeNuance(input: AnalyzeNuanceInput): Promise<{
  hasSignificantNuance: boolean;
  nuanceDescription?: string;
  significance?: string;
}> {
  try {
    logger.info('Query Agent Tool: analyze_nuance', {
      episodeId: input.episodeId,
      messageId: input.messageId,
    });

    const systemPrompt = `You are a linguistic analyst specializing in Japanese-to-English translation nuances for the visual novel "Higurashi no Naku Koro Ni".

Analyze the provided Japanese and English texts for significant differences in:
- Meaning, tone, or context
- Character relationships or emotions
- Cultural elements or wordplay
- Added, removed, or altered meaning

Only report SIGNIFICANT nuances that affect story understanding. If the translation is faithful with no important differences, respond with "NO_SIGNIFICANT_NUANCE".

Format your response as:
NUANCE: [brief description]
SIGNIFICANCE: [why this matters for understanding the story]

Or simply: NO_SIGNIFICANT_NUANCE`;

    const userPrompt = `Japanese: ${input.textJPN}

English: ${input.textENG}

Analyze for significant translation nuances.`;

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

    const response = await bedrockClient.send(command);
    const responseText = response.output?.message?.content?.[0]?.text || '';

    if (responseText.includes('NO_SIGNIFICANT_NUANCE')) {
      return {
        hasSignificantNuance: false,
      };
    }

    // Parse the response
    const nuanceMatch = responseText.match(/NUANCE:\s*(.+?)(?=\nSIGNIFICANCE:|$)/s);
    const significanceMatch = responseText.match(/SIGNIFICANCE:\s*(.+?)$/s);

    if (nuanceMatch && significanceMatch) {
      return {
        hasSignificantNuance: true,
        nuanceDescription: nuanceMatch[1].trim(),
        significance: significanceMatch[1].trim(),
      };
    }

    return {
      hasSignificantNuance: false,
    };
  } catch (error) {
    logger.error('Error in analyze_nuance tool', { error, input });
    throw error;
  }
}

/**
 * Lambda handler for Query Agent action group
 * Routes tool invocations to the appropriate handler
 */
export async function handler(event: any): Promise<any> {
  try {
    logger.info('Query Agent action group invoked', {
      actionGroup: event.actionGroup,
      function: event.function,
    });

    const functionName = event.function;
    const parameters = event.parameters || [];

    // Convert parameters array to object
    const input: Record<string, any> = {};
    for (const param of parameters) {
      input[param.name] = param.value;
    }

    let result: any;

    switch (functionName) {
      case 'search_knowledge_base':
        result = await searchKnowledgeBase(input as SearchKnowledgeBaseInput);
        break;

      case 'format_citation':
        result = await formatCitation(input as FormatCitationInput);
        break;

      case 'analyze_nuance':
        result = await analyzeNuance(input as AnalyzeNuanceInput);
        break;

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

    // Return response in the format expected by Bedrock Agents
    // Note: Bedrock agents require TEXT content type, not JSON
    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: functionName,
        functionResponse: {
          responseBody: {
            'TEXT': {
              body: typeof result === 'string' ? result : JSON.stringify(result),
            },
          },
        },
      },
    };
  } catch (error) {
    logger.error('Error in Query Agent action group handler', { error, event });
    
    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseState: 'FAILURE',
          responseBody: {
            'TEXT': {
              body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          },
        },
      },
    };
  }
}
