/**
 * Generate Embeddings Script
 * Processes script data from S3 and generates embeddings for vector search
 * 
 * Usage: Run this script to populate the Knowledge Base bucket with embeddings
 * Cost: ~$0.0001 per 1000 tokens (Titan Embeddings)
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ScriptChunk, generateEmbedding } from './vector-search';

const s3Client = new S3Client({});
const bedrockClient = new BedrockRuntimeClient({});

const SCRIPT_BUCKET = process.env.SCRIPT_BUCKET_NAME!;
const KB_BUCKET = process.env.KNOWLEDGE_BASE_BUCKET!;
const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks

interface ScriptMessage {
  id: string;
  speaker?: string;
  textJPN: string;
  textENG: string;
  metadata?: Record<string, any>;
}

interface ScriptFile {
  episodeId: string;
  chapterId: string;
  messages: ScriptMessage[];
}

/**
 * Chunk text into smaller pieces for embedding
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Process a single script file and generate embeddings
 */
async function processScriptFile(scriptKey: string): Promise<void> {
  console.log(`Processing ${scriptKey}...`);

  // Load script file from S3
  const getResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: SCRIPT_BUCKET,
      Key: scriptKey,
    })
  );

  const scriptData: ScriptFile = JSON.parse(await getResponse.Body!.transformToString());
  const { episodeId, chapterId, messages } = scriptData;

  let chunkIndex = 0;

  // Process each message
  for (const message of messages) {
    // Combine Japanese and English text for embedding
    const combinedText = `${message.textJPN}\n${message.textENG}`;
    
    // Chunk the text if it's too long
    const textChunks = chunkText(combinedText, CHUNK_SIZE, CHUNK_OVERLAP);

    for (const textChunk of textChunks) {
      // Generate embedding
      const embedding = await generateEmbedding(textChunk);

      // Create chunk object
      const chunk: ScriptChunk = {
        chunkId: `${episodeId}_${chapterId}_${message.id}_${chunkIndex}`,
        episodeId,
        chapterId,
        messageId: message.id,
        speaker: message.speaker,
        textJPN: message.textJPN,
        textENG: message.textENG,
        embedding,
        metadata: message.metadata || {},
      };

      // Save to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: KB_BUCKET,
          Key: `embeddings/${chunk.chunkId}.json`,
          Body: JSON.stringify(chunk),
          ContentType: 'application/json',
        })
      );

      chunkIndex++;
      
      // Rate limiting: wait 100ms between API calls to avoid throttling
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`✓ Processed ${scriptKey}: ${chunkIndex} chunks created`);
}

/**
 * Main function: Process all script files
 */
export async function generateAllEmbeddings(): Promise<void> {
  console.log('Starting embedding generation...');
  console.log(`Script Bucket: ${SCRIPT_BUCKET}`);
  console.log(`Knowledge Base Bucket: ${KB_BUCKET}`);

  // List all script files
  const listResponse = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: SCRIPT_BUCKET,
    })
  );

  if (!listResponse.Contents) {
    console.log('No script files found');
    return;
  }

  const scriptFiles = listResponse.Contents.filter(
    (obj) => obj.Key && obj.Key.endsWith('.json') && !obj.Key.includes('processed/')
  );

  console.log(`Found ${scriptFiles.length} script files to process`);

  // Process each file
  for (const file of scriptFiles) {
    if (!file.Key) continue;
    
    try {
      await processScriptFile(file.Key);
    } catch (error) {
      console.error(`Error processing ${file.Key}:`, error);
    }
  }

  console.log('✓ Embedding generation complete!');
}

// Run if executed directly
if (require.main === module) {
  generateAllEmbeddings()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
