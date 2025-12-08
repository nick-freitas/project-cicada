/**
 * Profile Migration Service
 * 
 * Handles migration of profile data from old schema versions to new versions.
 * Ensures backward compatibility and data integrity during schema updates.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  ProfileMigration,
  MigrationResult,
  MigrationSummary,
  CURRENT_PROFILE_VERSION,
} from './types';
import { getMigrationsForVersion, applyMigrations } from './migrations';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

export class ProfileMigrator {
  /**
   * Migrate a single profile to the target version
   */
  async migrateProfile(
    userId: string,
    profileType: string,
    profileId: string,
    currentVersion: number,
    targetVersion: number = CURRENT_PROFILE_VERSION
  ): Promise<MigrationResult> {
    try {
      // Skip if already at target version
      if (currentVersion >= targetVersion) {
        return {
          success: true,
          profileId,
          userId,
          fromVersion: currentVersion,
          toVersion: currentVersion,
        };
      }

      // Get the profile data
      const sortKey = `${profileType}#${profileId}`;
      const getResult = await docClient.send(
        new ScanCommand({
          TableName: USER_PROFILES_TABLE,
          FilterExpression: 'userId = :userId AND begins_with(sortKey, :sortKey)',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':sortKey': sortKey,
          },
          Limit: 1,
        })
      );

      if (!getResult.Items || getResult.Items.length === 0) {
        throw new Error(`Profile not found: ${userId}/${sortKey}`);
      }

      const profile = getResult.Items[0];

      // Get required migrations
      const migrationsToApply = getMigrationsForVersion(currentVersion, targetVersion);

      if (migrationsToApply.length === 0) {
        return {
          success: true,
          profileId,
          userId,
          fromVersion: currentVersion,
          toVersion: currentVersion,
        };
      }

      // Apply migrations
      const migratedProfile = applyMigrations(profile, migrationsToApply);

      // Update the profile in DynamoDB
      await docClient.send(
        new UpdateCommand({
          TableName: USER_PROFILES_TABLE,
          Key: {
            userId,
            sortKey,
          },
          UpdateExpression: 'SET profileData = :profileData, version = :version, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':profileData': migratedProfile.profileData,
            ':version': targetVersion,
            ':updatedAt': new Date().toISOString(),
          },
        })
      );

      return {
        success: true,
        profileId,
        userId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
      };
    } catch (error) {
      console.error('Migration error:', error);
      return {
        success: false,
        profileId,
        userId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Migrate all profiles in the system to the target version
   */
  async migrateAllProfiles(
    targetVersion: number = CURRENT_PROFILE_VERSION
  ): Promise<MigrationSummary> {
    const results: MigrationResult[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    try {
      // Scan all profiles
      do {
        const scanResult = await docClient.send(
          new ScanCommand({
            TableName: USER_PROFILES_TABLE,
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        if (scanResult.Items) {
          for (const item of scanResult.Items) {
            const currentVersion = item.version || 1;
            const [profileType, profileId] = item.sortKey.split('#');

            // Skip if already at target version
            if (currentVersion >= targetVersion) {
              results.push({
                success: true,
                profileId,
                userId: item.userId,
                fromVersion: currentVersion,
                toVersion: currentVersion,
              });
              continue;
            }

            // Migrate the profile
            const result = await this.migrateProfile(
              item.userId,
              profileType,
              profileId,
              currentVersion,
              targetVersion
            );

            results.push(result);
          }
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Calculate summary
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;
      const skippedCount = results.filter(
        (r) => r.success && r.fromVersion === r.toVersion
      ).length;

      return {
        totalProfiles: results.length,
        successCount,
        failureCount,
        skippedCount,
        results,
      };
    } catch (error) {
      console.error('Migration batch error:', error);
      throw error;
    }
  }

  /**
   * Verify migration integrity by checking all profiles have correct version
   */
  async verifyMigration(expectedVersion: number): Promise<{
    valid: boolean;
    invalidProfiles: Array<{ userId: string; profileId: string; version: number }>;
  }> {
    const invalidProfiles: Array<{ userId: string; profileId: string; version: number }> = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    try {
      do {
        const scanResult = await docClient.send(
          new ScanCommand({
            TableName: USER_PROFILES_TABLE,
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        if (scanResult.Items) {
          for (const item of scanResult.Items) {
            const currentVersion = item.version || 1;
            if (currentVersion < expectedVersion) {
              const [, profileId] = item.sortKey.split('#');
              invalidProfiles.push({
                userId: item.userId,
                profileId,
                version: currentVersion,
              });
            }
          }
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return {
        valid: invalidProfiles.length === 0,
        invalidProfiles,
      };
    } catch (error) {
      console.error('Verification error:', error);
      throw error;
    }
  }
}
