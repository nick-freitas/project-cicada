import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const KNOWLEDGE_BASE_BUCKET = process.env.KNOWLEDGE_BASE_BUCKET || '';
const EMBEDDING_MODEL = 'amazon.titan-embed-text-v1';
const EMBEDDING_DIMENSION = 1536;

export interface ScriptEmbedding {
  id: string;
  episodeId: string;
  chapterId: string;
  messageId: number;
  speaker?: string;
  textENG: string;
  textJPN?: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
  episodeId: string;
  episodeName: string;
  chapterId: string;
  messageId: number;
  speaker?: string;
  textENG: string;
  textJPN?: string;
  score: number;
  metadata: Record<string, any>;
}

export interface SearchOptions {
  episodeIds?: string[];
  topK?: number;
  minScore?: number;
  metadataFilters?: Record<string, any>;
}

/**
 * Generate embedding for text using Bedrock Titan Embeddings
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const command = new InvokeModelCommand({
      modelId: EMBEDDING_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text,
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    return responseBody.embedding;
  } catch (error) {
    logger.error('Error generating embedding', { error, text: text.substring(0, 100) });
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Store embedding in S3
 */
export async function storeEmbedding(embedding: ScriptEmbedding): Promise<void> {
  try {
    const key = `embeddings/${embedding.episodeId}/${embedding.chapterId}/${embedding.id}.json`;
    
    const command = new PutObjectCommand({
      Bucket: KNOWLEDGE_BASE_BUCKET,
      Key: key,
      Body: JSON.stringify(embedding),
      ContentType: 'application/json',
    });

    await s3Client.send(command);
    logger.info('Stored embedding', { id: embedding.id, episodeId: embedding.episodeId });
  } catch (error) {
    logger.error('Error storing embedding', { error, id: embedding.id });
    throw error;
  }
}

/**
 * Load all embeddings from S3 (with optional episode filter)
 */
async function loadEmbeddings(episodeIds?: string[]): Promise<ScriptEmbedding[]> {
  try {
    const embeddings: ScriptEmbedding[] = [];
    
    // If episode IDs are specified, only load those episodes
    const prefixes = episodeIds 
      ? episodeIds.map(id => `embeddings/${id}/`)
      : ['embeddings/'];

    for (const prefix of prefixes) {
      const listCommand = new ListObjectsV2Command({
        Bucket: KNOWLEDGE_BASE_BUCKET,
        Prefix: prefix,
      });

      const listResponse = await s3Client.send(listCommand);
      
      if (!listResponse.Contents) {
        continue;
      }

      // Load each embedding file
      for (const object of listResponse.Contents) {
        if (!object.Key) continue;

        const getCommand = new GetObjectCommand({
          Bucket: KNOWLEDGE_BASE_BUCKET,
          Key: object.Key,
        });

        const getResponse = await s3Client.send(getCommand);
        const body = await getResponse.Body?.transformToString();
        
        if (body) {
          const embedding = JSON.parse(body) as ScriptEmbedding;
          embeddings.push(embedding);
        }
      }
    }

    logger.info('Loaded embeddings', { count: embeddings.length, episodeIds });
    return embeddings;
  } catch (error) {
    logger.error('Error loading embeddings', { error, episodeIds });
    throw error;
  }
}

/**
 * Apply metadata filters to embeddings
 */
function applyMetadataFilters(
  embeddings: ScriptEmbedding[],
  filters?: Record<string, any>
): ScriptEmbedding[] {
  if (!filters || Object.keys(filters).length === 0) {
    return embeddings;
  }

  return embeddings.filter(embedding => {
    for (const [key, value] of Object.entries(filters)) {
      if (embedding.metadata[key] !== value) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Semantic search over Knowledge Base
 * Supports episode boundary enforcement and metadata filtering
 */
export async function semanticSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  try {
    const {
      episodeIds,
      topK = 10,
      minScore = 0.7,
      metadataFilters,
    } = options;

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Load embeddings (filtered by episode if specified)
    let embeddings = await loadEmbeddings(episodeIds);

    // Apply metadata filters
    embeddings = applyMetadataFilters(embeddings, metadataFilters);

    // Calculate similarity scores
    const results = embeddings.map(embedding => ({
      ...embedding,
      score: cosineSimilarity(queryEmbedding, embedding.embedding),
    }));

    // Filter by minimum score and sort by score descending
    const filteredResults = results
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Transform to SearchResult format
    const searchResults: SearchResult[] = filteredResults.map(r => ({
      id: r.id,
      episodeId: r.episodeId,
      episodeName: r.metadata.episodeName || r.episodeId,
      chapterId: r.chapterId,
      messageId: r.messageId,
      speaker: r.speaker,
      textENG: r.textENG,
      textJPN: r.textJPN,
      score: r.score,
      metadata: r.metadata,
    }));

    logger.info('Semantic search completed', {
      query: query.substring(0, 50),
      resultCount: searchResults.length,
      episodeIds,
    });

    return searchResults;
  } catch (error) {
    logger.error('Error in semantic search', { error, query: query.substring(0, 50) });
    throw error;
  }
}

/**
 * Group search results by episode
 */
export function groupResultsByEpisode(results: SearchResult[]): Map<string, SearchResult[]> {
  const grouped = new Map<string, SearchResult[]>();

  for (const result of results) {
    const episodeResults = grouped.get(result.episodeId) || [];
    episodeResults.push(result);
    grouped.set(result.episodeId, episodeResults);
  }

  return grouped;
}
