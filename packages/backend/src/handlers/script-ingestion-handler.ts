import { S3Event, S3Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { scriptIngestionService } from '../services/script-ingestion';
import { logger } from '../utils/logger';

const s3Client = new S3Client({});

/**
 * Lambda handler for processing script files uploaded to S3
 * Triggered by S3 ObjectCreated events
 */
export const handler: S3Handler = async (event: S3Event): Promise<void> => {
  logger.info('Script ingestion handler invoked', {
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      // Skip processed files and non-JSON files
      if (key.startsWith('processed/') || !key.endsWith('.json')) {
        logger.info('Skipping file', { key, reason: 'not a raw JSON file' });
        continue;
      }

      logger.info('Processing script file', { bucket, key });

      // Download file from S3
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      const fileContent = await response.Body?.transformToString();
      if (!fileContent) {
        logger.error('Empty file content', { bucket, key });
        continue;
      }

      // Extract filename from key
      const filename = key.split('/').pop() || key;

      // Process the script file
      await scriptIngestionService.processScriptFile(filename, fileContent);

      logger.info('Successfully processed script file', { bucket, key, filename });
    } catch (error) {
      logger.error('Failed to process script file', {
        error,
        record: record.s3,
      });
      // Continue processing other files even if one fails
    }
  }

  logger.info('Script ingestion handler completed', {
    recordCount: event.Records.length,
  });
};
