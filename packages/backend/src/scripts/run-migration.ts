#!/usr/bin/env node
/**
 * Migration CLI Script
 * 
 * Run profile migrations from the command line
 * 
 * Usage:
 *   npm run migrate -- --action=dry-run
 *   npm run migrate -- --action=migrate --target-version=2
 *   npm run migrate -- --action=verify
 */

import { ProfileMigrator } from '../services/migration/migrator';
import { CURRENT_SCHEMA_VERSION } from '../services/migration/types';

async function main() {
  const args = process.argv.slice(2);
  const action = args.find((arg) => arg.startsWith('--action='))?.split('=')[1] || 'dry-run';
  const targetVersionArg = args.find((arg) => arg.startsWith('--target-version='));
  const targetVersion = targetVersionArg
    ? parseInt(targetVersionArg.split('=')[1])
    : CURRENT_SCHEMA_VERSION;

  const tableName = process.env.USER_PROFILES_TABLE;
  if (!tableName) {
    console.error('Error: USER_PROFILES_TABLE environment variable not set');
    process.exit(1);
  }

  console.log(`\n🔄 Profile Migration Tool`);
  console.log(`Action: ${action}`);
  console.log(`Target Version: ${targetVersion}`);
  console.log(`Table: ${tableName}\n`);

  const migrator = new ProfileMigrator(tableName);

  try {
    switch (action) {
      case 'dry-run':
        console.log('Running dry-run migration...\n');
        const dryRunSummary = await migrator.migrateAllProfiles(targetVersion, true);
        console.log('Dry Run Results:');
        console.log(`  Total Profiles: ${dryRunSummary.totalProfiles}`);
        console.log(`  Would Migrate: ${dryRunSummary.successCount}`);
        console.log(`  Would Skip: ${dryRunSummary.skippedCount}`);
        console.log(`  Duration: ${dryRunSummary.durationMs}ms\n`);

        if (dryRunSummary.results.length > 0) {
          console.log('Profiles that would be migrated:');
          dryRunSummary.results.forEach((result) => {
            console.log(
              `  - ${result.profileType} ${result.profileId}: v${result.fromVersion} → v${result.toVersion}`
            );
          });
        }
        break;

      case 'migrate':
        console.log('⚠️  Running actual migration...\n');
        const migrationSummary = await migrator.migrateAllProfiles(targetVersion, false);
        console.log('Migration Results:');
        console.log(`  Total Profiles: ${migrationSummary.totalProfiles}`);
        console.log(`  ✅ Successful: ${migrationSummary.successCount}`);
        console.log(`  ❌ Failed: ${migrationSummary.failureCount}`);
        console.log(`  ⏭️  Skipped: ${migrationSummary.skippedCount}`);
        console.log(`  Duration: ${migrationSummary.durationMs}ms\n`);

        if (migrationSummary.failureCount > 0) {
          console.log('Failed migrations:');
          migrationSummary.results
            .filter((r) => !r.success)
            .forEach((result) => {
              console.log(`  - ${result.profileType} ${result.profileId}: ${result.error}`);
            });
        }
        break;

      case 'verify':
        console.log('Verifying migration integrity...\n');
        const verification = await migrator.verifyMigration();

        if (verification.valid) {
          console.log('✅ Migration verification passed!');
        } else {
          console.log('❌ Migration verification failed!');
          console.log('\nIssues found:');
          verification.issues.forEach((issue) => {
            console.log(`  - ${issue}`);
          });
          process.exit(1);
        }
        break;

      default:
        console.error(`Unknown action: ${action}`);
        console.log('\nAvailable actions:');
        console.log('  --action=dry-run     Preview what would be migrated');
        console.log('  --action=migrate     Run actual migration');
        console.log('  --action=verify      Verify migration integrity');
        process.exit(1);
    }

    console.log('\n✨ Done!\n');
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main();
