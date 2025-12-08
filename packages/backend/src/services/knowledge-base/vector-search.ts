/**
 * Custom Vector Search Service
 * Cost-effective alternative to Bedrock Knowledge Base using S3-stored embeddings
 * 
 * Architecture:
 * - Embeddings stored in S3 (Knowledge Base bucket)
 * - Metadata stored alongside embeddings (episodeId, chapterId, speaker, etc.)
 * - Cosine similarity search in-memory
 * - Episode boundary enforcement via metadata filtering
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const s3Client = new S3Client({});
const bedrockClient = new BedrockRuntimeClient({});

const KB_BUCKET = process.env.KNOWLEDGE_BASE_BUCKET!;
const EMBEDDING_MODEL = 'amazon.titan-embed-text-v1';
const EMBEDDING_DIMENSION = 1536;

export interface ScriptChunk {
  chunkId: string;
  episodeId: string;
  chapterId: string;
  messageId: string;
  speaker?: string;
  textJPN: string;
  textENG: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  chunk: ScriptChunk;
  score: number;
  citation: string;
}

export interface SearchOptions {
  topK?: number;
  episodeFilter?: string[];
  characterFilter?: string;
  minScore?: number;
}

/**
 * Generate embedding for a text query using Bedrock Titan
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text,
      }),
    })
  );

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.embedding;
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
 * Load embeddings from S3 with optional filtering
 */
async function loadEmbeddings(options: SearchOptions = {}): Promise<ScriptChunk[]> {
  const chunks: ScriptChunk[] = [];
  
  // List all embedding files in S3
  const listResponse = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: KB_BUCKET,
      Prefix: 'embeddings/',
    })
  );

  if (!listResponse.Contents) {
    return chunks;
  }

  // Load each embedding file
  for (const object of listResponse.Contents) {
    if (!object.Key || !object.Key.endsWith('.json')) {
      continue;
    }

    const getResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: KB_BUCKET,
        Key: object.Key,
      })
    );

    const chunkData = JSON.parse(await getResponse.Body!.transformToString());
    
    // Apply episode filter
    if (options.episodeFilter && !options.episodeFilter.includes(chunkData.episodeId)) {
      continue;
    }

    // Apply character filter
    if (options.characterFilter && chunkData.speaker !== options.characterFilter) {
      continue;
    }

    chunks.push(chunkData);
  }

  return chunks;
}

/**
 * Search for similar chunks using vector similarity
 */
export async function searchSimilarChunks(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    topK = 5,
    minScore = 0.7,
  } = options;

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);

  // Load embeddings from S3 (with filtering)
  const chunks = await loadEmbeddings(options);

  // Calculate similarity scores
  const results: SearchResult[] = chunks.map((chunk) => {
    const score = cosineSimilarity(queryEmbedding, chunk.embedding);
    const citation = `${chunk.episodeId}/${chunk.chapterId}/${chunk.messageId}`;
    
    return {
      chunk,
      score,
      citation,
    };
  });

  // Filter by minimum score and sort by score descending
  return results
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Format search results for agent consumption
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant script passages found.';
  }

  return results
    .map((result, index) => {
      const { chunk, score, citation } = result;
      return `
[Result ${index + 1}] (Relevance: ${(score * 100).toFixed(1)}%)
Citation: ${citation}
Speaker: ${chunk.speaker || 'Narrator'}
Japanese: ${chunk.textJPN}
English: ${chunk.textENG}
`;
    })
    .join('\n---\n');
}
