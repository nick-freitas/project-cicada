import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { ScriptMessage } from '@cicada/shared-types';
import { logger } from '../utils/logger';
import { episodeConfigService } from './episode-config';

const s3Client = new S3Client({});
const bedrockClient = new BedrockRuntimeClient({});

const SCRIPT_BUCKET = process.env.SCRIPT_BUCKET_NAME || 'cicada-script-data';
const KB_BUCKET = process.env.KB_BUCKET_NAME || 'cicada-knowledge-base';
const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v1';

export interface RawScriptMessage {
  type: string;
  MessageID: number;
  TextJPN: string;
  TextENG: string;
}

export interface ProcessedScriptData {
  messages: ScriptMessage[];
  episodeId: string;
  chapterId: string;
}

export class ScriptIngestionService {
  /**
   * Parse a JSON script file and extract all required fields
   */
  parseScriptJSON(jsonContent: string): RawScriptMessage[] {
    try {
      const data = JSON.parse(jsonContent);
      
      // Handle both array and object formats
      const messages = Array.isArray(data) ? data : data.messages || [];
      
      const parsed: RawScriptMessage[] = [];
      
      for (const item of messages) {
        // Validate required fields
        // type must be a non-empty string
        if (
          typeof item.type === 'string' &&
          item.type.length > 0 &&
          typeof item.MessageID === 'number' &&
          typeof item.TextJPN === 'string' &&
          typeof item.TextENG === 'string'
        ) {
          parsed.push({
            type: item.type,
            MessageID: item.MessageID,
            TextJPN: item.TextJPN,
            TextENG: item.TextENG,
          });
        } else {
          logger.warn('Skipping invalid message entry', { item });
        }
      }
      
      logger.info('Parsed script JSON', { messageCount: parsed.length });
      return parsed;
    } catch (error) {
      logger.error('Failed to parse script JSON', { error });
      throw new Error(`JSON parsing failed: ${error}`);
    }
  }

  /**
   * Associate chapter with episode using configuration
   */
  async associateChapterWithEpisode(
    filename: string,
    messages: RawScriptMessage[]
  ): Promise<ProcessedScriptData> {
    try {
      // Extract chapter ID from filename (e.g., "kageboushi_11.json" -> "kageboushi_11")
      const chapterId = filename.replace(/\.(json|txt)$/i, '');
      
      // Resolve episode from filename
      const episodeConfig = await episodeConfigService.resolveEpisodeFromFilename(filename);
      
      if (!episodeConfig) {
        throw new Error(`No episode configuration found for filename: ${filename}`);
      }
      
      // Add episode and chapter metadata to each message
      const processedMessages: ScriptMessage[] = messages.map((msg) => ({
        ...msg,
        episodeId: episodeConfig.episodeId,
        chapterId,
        speaker: this.extractSpeaker(msg),
      }));
      
      logger.info('Associated chapter with episode', {
        filename,
        episodeId: episodeConfig.episodeId,
        chapterId,
        messageCount: processedMessages.length,
      });
      
      return {
        messages: processedMessages,
        episodeId: episodeConfig.episodeId,
        chapterId,
      };
    } catch (error) {
      logger.error('Failed to associate chapter with episode', { error, filename });
      throw error;
    }
  }

  /**
   * Generate embedding for text using Bedrock
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await bedrockClient.send(
        new InvokeModelCommand({
          modelId: EMBEDDING_MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputText: text,
          }),
        })
      );
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const embedding = responseBody.embedding;
      
      if (!Array.isArray(embedding)) {
        throw new Error('Invalid embedding response format');
      }
      
      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', { error, textLength: text.length });
      throw error;
    }
  }

  /**
   * Store processed script data in S3
   */
  async storeScriptData(data: ProcessedScriptData): Promise<string> {
    try {
      const key = `processed/${data.episodeId}/${data.chapterId}.json`;
      
      await s3Client.send(
        new PutObjectCommand({
          Bucket: SCRIPT_BUCKET,
          Key: key,
          Body: JSON.stringify(data, null, 2),
          ContentType: 'application/json',
        })
      );
      
      logger.info('Stored script data in S3', { key });
      return key;
    } catch (error) {
      logger.error('Failed to store script data', { error, data });
      throw error;
    }
  }

  /**
   * Retrieve script data from S3
   */
  async retrieveScriptData(episodeId: string, chapterId: string): Promise<ProcessedScriptData> {
    try {
      const key = `processed/${episodeId}/${chapterId}.json`;
      
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: SCRIPT_BUCKET,
          Key: key,
        })
      );
      
      const body = await response.Body?.transformToString();
      if (!body) {
        throw new Error('Empty response body');
      }
      
      const data = JSON.parse(body) as ProcessedScriptData;
      logger.info('Retrieved script data from S3', { key });
      return data;
    } catch (error) {
      logger.error('Failed to retrieve script data', { error, episodeId, chapterId });
      throw error;
    }
  }

  /**
   * Index script data in Knowledge Base
   * Generates embeddings and stores them with metadata filters
   */
  async indexInKnowledgeBase(data: ProcessedScriptData): Promise<void> {
    try {
      const { storeEmbedding, generateEmbedding } = await import('./knowledge-base-service');
      
      // Get episode name from config
      const episodeConfig = await episodeConfigService.getConfigById(data.episodeId);
      const episodeName = episodeConfig?.episodeName || data.episodeId;
      
      // For each message, generate embedding and store in KB
      for (const message of data.messages) {
        // Combine English and Japanese text for embedding
        const textForEmbedding = `${message.TextENG}\n${message.TextJPN}`;
        
        const embedding = await generateEmbedding(textForEmbedding);
        
        // Create embedding record with metadata filters
        await storeEmbedding({
          id: `${data.episodeId}-${data.chapterId}-${message.MessageID}`,
          episodeId: data.episodeId,
          chapterId: data.chapterId,
          messageId: message.MessageID,
          speaker: message.speaker,
          textENG: message.TextENG,
          textJPN: message.TextJPN,
          embedding,
          metadata: {
            episodeName,
            type: message.type,
            chapterId: data.chapterId,
            messageId: message.MessageID,
            speaker: message.speaker || 'narrator',
          },
        });
      }
      
      logger.info('Indexed script data in Knowledge Base', {
        episodeId: data.episodeId,
        chapterId: data.chapterId,
        messageCount: data.messages.length,
      });
    } catch (error) {
      logger.error('Failed to index in Knowledge Base', { error, data });
      throw error;
    }
  }

  /**
   * Process a script file end-to-end
   */
  async processScriptFile(filename: string, jsonContent: string): Promise<void> {
    try {
      logger.info('Processing script file', { filename });
      
      // 1. Parse JSON
      const rawMessages = this.parseScriptJSON(jsonContent);
      
      // 2. Associate with episode
      const processedData = await this.associateChapterWithEpisode(filename, rawMessages);
      
      // 3. Store in S3
      await this.storeScriptData(processedData);
      
      // 4. Generate embeddings and index in Knowledge Base
      await this.indexInKnowledgeBase(processedData);
      
      logger.info('Successfully processed script file', { filename });
    } catch (error) {
      logger.error('Failed to process script file', { error, filename });
      throw error;
    }
  }

  /**
   * Extract speaker from message (basic implementation)
   * This can be enhanced based on actual script format
   */
  private extractSpeaker(message: RawScriptMessage): string | undefined {
    // Check if type indicates a speaker
    if (message.type === 'MSGSET') {
      // Try to extract speaker from English text (common pattern: "Speaker: text")
      const speakerMatch = message.TextENG.match(/^([^:]+):/);
      if (speakerMatch) {
        return speakerMatch[1].trim();
      }
    }
    return undefined;
  }
}

export const scriptIngestionService = new ScriptIngestionService();
