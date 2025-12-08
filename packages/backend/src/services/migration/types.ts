/**
 * Profile Migration Types
 * 
 * Defines the structure for profile schema migrations to support
 * backward-compatible data structure changes.
 */

export interface ProfileMigration {
  fromVersion: number;
  toVersion: number;
  description: string;
  migrate: (oldProfile: any) => any;
}

export interface MigrationResult {
  success: boolean;
  profileId: string;
  userId: string;
  fromVersion: number;
  toVersion: number;
  error?: string;
}

export interface MigrationSummary {
  totalProfiles: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  results: MigrationResult[];
}

export const CURRENT_PROFILE_VERSION = 1;
