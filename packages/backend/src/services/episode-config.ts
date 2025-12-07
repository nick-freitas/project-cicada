import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { EpisodeConfig } from '@cicada/shared-types';
import { logger } from '../utils/logger';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.EPISODE_CONFIG_TABLE_NAME || 'EpisodeConfiguration';

export class EpisodeConfigService {
  /**
   * Store an episode configuration
   */
  async storeConfig(config: EpisodeConfig): Promise<void> {
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            episodeId: config.episodeId,
            episodeName: config.episodeName,
            filePattern: config.filePattern,
            arcType: config.arcType,
            metadata: config.metadata ?? {},
          },
        })
      );
      logger.info('Episode configuration stored', { episodeId: config.episodeId });
    } catch (error) {
      logger.error('Failed to store episode configuration', { error, config });
      throw error;
    }
  }

  /**
   * Get episode configuration by episode ID
   */
  async getConfigById(episodeId: string): Promise<EpisodeConfig | null> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { episodeId },
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as EpisodeConfig;
    } catch (error) {
      logger.error('Failed to get episode configuration', { error, episodeId });
      throw error;
    }
  }

  /**
   * Get all episode configurations
   */
  async getAllConfigs(): Promise<EpisodeConfig[]> {
    try {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
        })
      );

      return (result.Items || []) as EpisodeConfig[];
    } catch (error) {
      logger.error('Failed to get all episode configurations', { error });
      throw error;
    }
  }

  /**
   * Resolve episode from chapter filename
   * Matches the filename against file patterns in configurations
   */
  async resolveEpisodeFromFilename(filename: string): Promise<EpisodeConfig | null> {
    try {
      const configs = await this.getAllConfigs();

      // Remove file extension if present
      const baseFilename = filename.replace(/\.(json|txt)$/i, '');

      for (const config of configs) {
        if (this.matchesPattern(baseFilename, config.filePattern)) {
          return config;
        }
      }

      logger.warn('No episode configuration found for filename', { filename });
      return null;
    } catch (error) {
      logger.error('Failed to resolve episode from filename', { error, filename });
      throw error;
    }
  }

  /**
   * Get episode configuration by human-readable name
   */
  async getConfigByName(episodeName: string): Promise<EpisodeConfig | null> {
    try {
      const configs = await this.getAllConfigs();

      const config = configs.find(
        (c) => c.episodeName.toLowerCase() === episodeName.toLowerCase()
      );

      return config || null;
    } catch (error) {
      logger.error('Failed to get episode configuration by name', { error, episodeName });
      throw error;
    }
  }

  /**
   * Query episode by either file pattern or human-readable name
   */
  async queryEpisode(query: string): Promise<EpisodeConfig | null> {
    try {
      // First try as episode ID
      let config = await this.getConfigById(query);
      if (config) return config;

      // Try as human-readable name
      config = await this.getConfigByName(query);
      if (config) return config;

      // Try as filename pattern
      config = await this.resolveEpisodeFromFilename(query);
      if (config) return config;

      return null;
    } catch (error) {
      logger.error('Failed to query episode', { error, query });
      throw error;
    }
  }

  /**
   * Match a filename against a pattern
   * Supports wildcards (*) in patterns
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    // Convert pattern to regex
    // Escape special regex characters except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }
}

export const episodeConfigService = new EpisodeConfigService();
