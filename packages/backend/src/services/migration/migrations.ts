/**
 * Profile Schema Migrations
 * 
 * Registry of all profile schema migrations. Each migration transforms
 * profiles from one version to the next.
 */

import { ProfileMigration } from './types';

/**
 * Example migration from version 1 to version 2
 * This is a template - actual migrations will be added as schema evolves
 */
const migration_1_to_2: ProfileMigration = {
  fromVersion: 1,
  toVersion: 2,
  description: 'Example migration - add new field with default value',
  migrate: (profile: any) => ({
    ...profile,
    version: 2,
    // Example: Add new field
    // newField: 'default value',
  }),
};

/**
 * Ordered list of all migrations
 * Migrations are applied sequentially to bring profiles up to current version
 */
export const migrations: ProfileMigration[] = [
  // migration_1_to_2, // Uncomment when needed
];

/**
 * Get migrations needed to upgrade from a specific version to target version
 */
export function getMigrationsForVersion(
  currentVersion: number,
  targetVersion: number
): ProfileMigration[] {
  return migrations.filter(
    (m) => m.fromVersion >= currentVersion && m.toVersion <= targetVersion
  );
}

/**
 * Apply a series of migrations to a profile
 */
export function applyMigrations(
  profile: any,
  migrationsToApply: ProfileMigration[]
): any {
  let migratedProfile = { ...profile };

  for (const migration of migrationsToApply) {
    migratedProfile = migration.migrate(migratedProfile);
  }

  return migratedProfile;
}
