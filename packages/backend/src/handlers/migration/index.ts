/**
 * Migration Lambda Handler
 * 
 * Lambda function for running profile schema migrations.
 * Can be invoked manually or triggered by deployment automation.
 */

import { Handler } from 'aws-lambda';
import { ProfileMigrator } from '../../services/migration/migrator';
import { CURRENT_PROFILE_VERSION } from '../../services/migration/types';

interface MigrationEvent {
  targetVersion?: number;
  dryRun?: boolean;
  verifyOnly?: boolean;
}

interface MigrationResponse {
  success: boolean;
  message: string;
  summary?: any;
  verification?: any;
  error?: string;
}

export const handler: Handler<MigrationEvent, MigrationResponse> = async (event) => {
  console.log('Migration event:', JSON.stringify(event, null, 2));

  const targetVersion = event.targetVersion || CURRENT_PROFILE_VERSION;
  const dryRun = event.dryRun || false;
  const verifyOnly = event.verifyOnly || false;

  const migrator = new ProfileMigrator();

  try {
    // Verification only mode
    if (verifyOnly) {
      console.log(`Verifying profiles are at version ${targetVersion}...`);
      const verification = await migrator.verifyMigration(targetVersion);

      return {
        success: verification.valid,
        message: verification.valid
          ? 'All profiles are at the expected version'
          : `Found ${verification.invalidProfiles.length} profiles that need migration`,
        verification,
      };
    }

    // Dry run mode - just report what would be migrated
    if (dryRun) {
      console.log(`Dry run: Would migrate profiles to version ${targetVersion}`);
      return {
        success: true,
        message: 'Dry run completed - no changes made',
      };
    }

    // Run actual migration
    console.log(`Starting migration to version ${targetVersion}...`);
    const summary = await migrator.migrateAllProfiles(targetVersion);

    console.log('Migration summary:', JSON.stringify(summary, null, 2));

    // Verify migration succeeded
    const verification = await migrator.verifyMigration(targetVersion);

    if (!verification.valid) {
      console.error('Migration verification failed:', verification.invalidProfiles);
      return {
        success: false,
        message: 'Migration completed but verification failed',
        summary,
        verification,
      };
    }

    return {
      success: true,
      message: `Successfully migrated ${summary.successCount} profiles to version ${targetVersion}`,
      summary,
      verification,
    };
  } catch (error) {
    console.error('Migration handler error:', error);
    return {
      success: false,
      message: 'Migration failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
