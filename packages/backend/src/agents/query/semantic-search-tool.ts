/**
 * Semantic Search Tool for Query Agent
 * 
 * This tool provides semantic search capabilities over the Higurashi script database.
 * It uses vector embeddings to find relevant passages based on query similarity.
 * 
 * Requirements: 6.1, 6.2
 */

import { z } from 'zod';
import { CICADAToolBase, ToolExecutionContext } from '../base';
import { semanticSearch, SearchResult, SearchOptions } from '../../services/knowledge-base-service';

/**
 * Input schema for semantic search tool
 */
const semanticSearchInputSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  topK: z.number().int().positive().optional().default(20),
  minScore: z.number().min(0).max(1).optional().default(0.5),
  maxEmbeddingsToLoad: z.number().int().positive().optional().default(3000),
  episodeIds: z.array(z.string()).optional(),
});

export type SemanticSearchInput = z.infer<typeof semanticSearchInputSchema>;

/**
 * Output type for semantic search tool
 */
export interface SemanticSearchOutput {
  results: SearchResult[];
  resultCount: number;
  query: string;
}

/**
 * Semantic Search Tool
 * 
 * Searches the Higurashi script database using semantic similarity.
 * Always invoked by the Query Agent - no autonomous decision making.
 */
export class SemanticSearchTool extends CICADAToolBase<SemanticSearchInput, SemanticSearchOutput> {
  constructor() {
    super({
      name: 'semanticSearch',
      description: 'Search Higurashi script database using semantic similarity. Returns relevant passages with episode, chapter, speaker, and text information.',
      inputSchema: semanticSearchInputSchema,
    });
  }

  /**
   * Execute semantic search
   */
  protected async executeInternal(
    input: SemanticSearchInput,
    context: ToolExecutionContext
  ): Promise<SemanticSearchOutput> {
    const searchOptions: SearchOptions = {
      topK: input.topK,
      minScore: input.minScore,
      maxEmbeddingsToLoad: input.maxEmbeddingsToLoad,
      episodeIds: input.episodeIds,
    };

    // Perform semantic search
    const results = await semanticSearch(input.query, searchOptions);

    return {
      results,
      resultCount: results.length,
      query: input.query,
    };
  }

  /**
   * Sanitize input for logging (truncate long queries)
   */
  protected sanitizeForLogging(input: SemanticSearchInput): any {
    return {
      ...input,
      query: input.query.substring(0, 100) + (input.query.length > 100 ? '...' : ''),
    };
  }
}
