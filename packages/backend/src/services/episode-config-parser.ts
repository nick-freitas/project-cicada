import { EpisodeConfig } from '@cicada/shared-types';
import { logger } from '../utils/logger';

export interface EpisodeConfigInput {
  episodeId: string;
  episodeName: string;
  filePattern: string;
  arcType: 'question' | 'answer' | 'other';
  metadata?: Record<string, unknown>;
}

export class EpisodeConfigParser {
  /**
   * Parse episode configuration from JSON
   */
  parseJSON(json: string): EpisodeConfig[] {
    try {
      const data = JSON.parse(json);

      if (Array.isArray(data)) {
        return data.map((item) => this.validateAndNormalize(item));
      } else if (typeof data === 'object' && data !== null) {
        return [this.validateAndNormalize(data)];
      } else {
        throw new Error('Invalid episode configuration format');
      }
    } catch (error) {
      logger.error('Failed to parse episode configuration JSON', { error });
      throw error;
    }
  }

  /**
   * Parse episode configuration from array of objects
   */
  parseArray(configs: EpisodeConfigInput[]): EpisodeConfig[] {
    try {
      return configs.map((config) => this.validateAndNormalize(config));
    } catch (error) {
      logger.error('Failed to parse episode configuration array', { error });
      throw error;
    }
  }

  /**
   * Validate and normalize a single episode configuration
   */
  private validateAndNormalize(input: EpisodeConfigInput): EpisodeConfig {
    // Validate required fields
    if (!input.episodeId || typeof input.episodeId !== 'string') {
      throw new Error('episodeId is required and must be a string');
    }

    if (!input.episodeName || typeof input.episodeName !== 'string') {
      throw new Error('episodeName is required and must be a string');
    }

    if (!input.filePattern || typeof input.filePattern !== 'string') {
      throw new Error('filePattern is required and must be a string');
    }

    if (!input.arcType || !['question', 'answer', 'other'].includes(input.arcType)) {
      throw new Error('arcType is required and must be "question", "answer", or "other"');
    }

    // Return normalized configuration
    return {
      episodeId: input.episodeId.trim(),
      episodeName: input.episodeName.trim(),
      filePattern: input.filePattern.trim(),
      arcType: input.arcType,
      metadata: input.metadata || {},
    };
  }
}

export const episodeConfigParser = new EpisodeConfigParser();
