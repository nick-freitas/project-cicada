import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { semanticSearch, groupResultsByEpisode, SearchResult } from '../services/knowledge-base-service';
import { Citation } from '@cicada/shared-types';
import { logger } from '../utils/logger';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const MODEL_ID = process.env.MODEL_ID || 'amazon.nova-lite-v1:0';

export interface QueryAgentRequest {
  query: string;
  userId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
  characterFocus?: string;
}

export interface QueryAgentResponse {
  content: string;
  citations: Citation[];
  hasDirectEvidence: boolean;
  nuanceAnalysis?: NuanceAnalysis[];
}

export interface NuanceAnalysis {
  citation: Citation;
  nuanceDescription: string;
  significance: string;
}

/**
 * Query Agent - Specialized agent for script search and citation
 * 
 * Responsibilities:
 * - Semantic search over Knowledge Base
 * - Episode boundary enforcement
 * - Citation formatting with complete metadata
 * - Japanese/English nuance analysis
 * - Result grouping by episode
 */
export class QueryAgent {
  /**
   * Process a query and return structured results with citations
   */
  async processQuery(request: QueryAgentRequest): Promise<QueryAgentResponse> {
    try {
      logger.info('Query Agent processing request', {
        userId: request.userId,
        query: request.query.substring(0, 100),
        episodeContext: request.episodeContext,
      });

      // Step 1: Perform semantic search with episode boundary enforcement
      const searchResults = await this.performSemanticSearch(request);

      // Step 2: Filter by character if specified
      const filteredResults = request.characterFocus
        ? this.filterByCharacter(searchResults, request.characterFocus)
        : searchResults;

      // Step 3: Group results by episode
      const groupedResults = groupResultsByEpisode(filteredResults);

      // Step 4: Format citations
      const citations = this.formatCitations(filteredResults);

      // Step 5: Generate response with AI model
      const response = await this.generateResponse(
        request.query,
        filteredResults,
        groupedResults
      );

      // Step 6: Analyze nuances if Japanese text is available
      const nuanceAnalysis = await this.analyzeNuances(filteredResults);

      // Step 7: Determine if response has direct evidence
      const hasDirectEvidence = filteredResults.length > 0;

      logger.info('Query Agent completed processing', {
        userId: request.userId,
        citationCount: citations.length,
        hasDirectEvidence,
      });

      return {
        content: response,
        citations,
        hasDirectEvidence,
        nuanceAnalysis: nuanceAnalysis.length > 0 ? nuanceAnalysis : undefined,
      };
    } catch (error) {
      logger.error('Error in Query Agent', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Perform semantic search with episode boundary enforcement
   */
  private async performSemanticSearch(request: QueryAgentRequest): Promise<SearchResult[]> {
    const searchOptions = {
      episodeIds: request.episodeContext,
      topK: 20,
      minScore: 0.7,
    };

    return await semanticSearch(request.query, searchOptions);
  }

  /**
   * Filter results to only include passages featuring the specified character
   * Property 19: Character-Focused Retrieval
   */
  private filterByCharacter(results: SearchResult[], characterName: string): SearchResult[] {
    const normalizedCharacter = characterName.toLowerCase();
    
    return results.filter(result => {
      // Check if speaker matches
      if (result.speaker?.toLowerCase().includes(normalizedCharacter)) {
        return true;
      }

      // Check if character is mentioned in the text
      const textLower = result.textENG.toLowerCase();
      if (textLower.includes(normalizedCharacter)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Format search results as citations with complete metadata
   * Property 8: Citation Completeness
   */
  private formatCitations(results: SearchResult[]): Citation[] {
    return results.map(result => ({
      episodeId: result.episodeId,
      episodeName: result.episodeName,
      chapterId: result.chapterId,
      messageId: result.messageId,
      speaker: result.speaker,
      textENG: result.textENG,
      textJPN: result.textJPN,
    }));
  }

  /**
   * Generate response using AI model with citations as context
   */
  private async generateResponse(
    query: string,
    results: SearchResult[],
    groupedResults: Map<string, SearchResult[]>
  ): Promise<string> {
    // If no results, indicate this is inference/speculation
    // Property 10: Inference Transparency
    if (results.length === 0) {
      return await this.generateInferenceResponse(query);
    }

    // Build context from search results grouped by episode
    const contextParts: string[] = [];
    
    for (const [episodeId, episodeResults] of groupedResults.entries()) {
      const episodeName = episodeResults[0]?.episodeName || episodeId;
      contextParts.push(`\n=== Episode: ${episodeName} ===`);
      
      for (const result of episodeResults.slice(0, 5)) {
        const speaker = result.speaker ? `[${result.speaker}] ` : '';
        contextParts.push(
          `Chapter ${result.chapterId}, Message ${result.messageId}: ${speaker}${result.textENG}`
        );
      }
    }

    const context = contextParts.join('\n');

    const systemPrompt = `You are the Query Agent for CICADA, a system analyzing the visual novel "Higurashi no Naku Koro Ni".

Your role is to answer questions based ONLY on the provided script passages. Follow these rules:

1. Base your answer strictly on the provided passages
2. Reference specific episodes, chapters, and speakers when making claims
3. Maintain episode boundaries - don't mix information from different episodes unless explicitly comparing
4. If passages are from multiple episodes, clearly indicate which episode each piece of information comes from
5. Be precise and cite your sources
6. Do not speculate beyond what the passages show

Provided passages:
${context}`;

    const userPrompt = `Based on the passages above, answer this question: ${query}`;

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

      const response = await bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      return responseText;
    } catch (error) {
      logger.error('Error generating response', { error });
      throw error;
    }
  }

  /**
   * Generate response when no direct evidence exists
   * Property 10: Inference Transparency
   */
  private async generateInferenceResponse(query: string): Promise<string> {
    const systemPrompt = `You are the Query Agent for CICADA, a system analyzing the visual novel "Higurashi no Naku Koro Ni".

No direct script passages were found for this query. You should:

1. Clearly state that this is INFERENCE or SPECULATION
2. Explain that no direct evidence was found in the script
3. Provide a brief, cautious response if you have general knowledge
4. Suggest what kind of information might help answer the question

Be honest about the lack of evidence.`;

    const userPrompt = `No script passages were found for this query: ${query}

Provide a response that clearly indicates this is inference/speculation.`;

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

      const response = await bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Prepend explicit marker
      return `[INFERENCE - No Direct Evidence Found]\n\n${responseText}`;
    } catch (error) {
      logger.error('Error generating inference response', { error });
      throw error;
    }
  }

  /**
   * Analyze Japanese/English nuances for significant differences
   */
  private async analyzeNuances(results: SearchResult[]): Promise<NuanceAnalysis[]> {
    const nuanceAnalyses: NuanceAnalysis[] = [];

    // Only analyze passages that have both Japanese and English text
    const passagesWithBothLanguages = results.filter(r => r.textJPN && r.textJPN.trim().length > 0);

    if (passagesWithBothLanguages.length === 0) {
      return nuanceAnalyses;
    }

    // Analyze up to 3 passages for nuances
    for (const result of passagesWithBothLanguages.slice(0, 3)) {
      const nuance = await this.analyzePassageNuance(result);
      if (nuance) {
        nuanceAnalyses.push(nuance);
      }
    }

    return nuanceAnalyses;
  }

  /**
   * Analyze a single passage for linguistic nuances
   */
  private async analyzePassageNuance(result: SearchResult): Promise<NuanceAnalysis | null> {
    const systemPrompt = `You are a linguistic analyst specializing in Japanese-to-English translation nuances.

Analyze the provided Japanese and English texts for significant differences in:
- Meaning, tone, or context
- Character relationships or emotions
- Cultural elements or wordplay
- Added, removed, or altered meaning

Only report SIGNIFICANT nuances. If the translation is faithful with no important differences, respond with "NO_SIGNIFICANT_NUANCE".

Format your response as:
NUANCE: [brief description]
SIGNIFICANCE: [why this matters for understanding the story]

Or simply: NO_SIGNIFICANT_NUANCE`;

    const userPrompt = `Japanese: ${result.textJPN}

English: ${result.textENG}

Analyze for significant translation nuances.`;

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

      const response = await bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      if (responseText.includes('NO_SIGNIFICANT_NUANCE')) {
        return null;
      }

      // Parse the response
      const nuanceMatch = responseText.match(/NUANCE:\s*(.+?)(?=\nSIGNIFICANCE:|$)/s);
      const significanceMatch = responseText.match(/SIGNIFICANCE:\s*(.+?)$/s);

      if (nuanceMatch && significanceMatch) {
        return {
          citation: {
            episodeId: result.episodeId,
            episodeName: result.episodeName,
            chapterId: result.chapterId,
            messageId: result.messageId,
            speaker: result.speaker,
            textENG: result.textENG,
            textJPN: result.textJPN,
          },
          nuanceDescription: nuanceMatch[1].trim(),
          significance: significanceMatch[1].trim(),
        };
      }

      return null;
    } catch (error) {
      logger.error('Error analyzing nuance', { error, messageId: result.messageId });
      return null;
    }
  }
}

// Export singleton instance
export const queryAgent = new QueryAgent();
