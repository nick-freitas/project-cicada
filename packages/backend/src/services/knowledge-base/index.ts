/**
 * Knowledge Base Service
 * Custom vector search implementation for cost-effective semantic search
 */

export {
  searchSimilarChunks,
  formatSearchResults,
  generateEmbedding,
  type ScriptChunk,
  type SearchResult,
  type SearchOptions,
} from './vector-search';

export { generateAllEmbeddings } from './generate-embeddings';
