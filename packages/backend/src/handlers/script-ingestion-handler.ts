import { S3Event, S3Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { scriptIngestionService } from '../services/script-ingestion';
import { logger } from '../utils/logger';

const s3Client = new S3Client({});

/**
 * Lambda handler for S3 events
 * Triggered when new script files are uploaded to the script bucket
 */
export const handler: S3Handler = async (event: S3Event): Promise<void> => {
  logger.info('Script ingestion handler invoked', { recordCount: event.Records.length });

  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      logger.info('Processing S3 object', { bucket, key });

      // Only process JSON files
      if (!key.endsWith('.json')) {
        logger.info('Skipping non-JSON file', { key });
        continue;
      }

      // Get the file from S3
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      const body = await response.Body?.transformToString();
      if (!body) {
        logger.warn('Empty file body', { key });
        continue;
      }

      // Extract filename from key
      const filename = key.split('/').pop() || key;

      // Process the script file
      await scriptIngestionService.processScriptFile(filename, body);

      logger.info('Successfully processed S3 object', { bucket, key });
    } catch (error) {
      logger.error('Failed to process S3 object', {
        error,
        record: record.s3,
      });
      // Don't throw - continue processing other records
    }
  }

  logger.info('Script ingestion handler completed');
};
