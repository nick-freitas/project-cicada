# Profile Migration System

This directory contains the profile schema migration framework for CICADA. It enables backward-compatible schema changes while preserving existing user data.

## Overview

The migration system provides:
- **Version tracking** for all profiles
- **Sequential migrations** to upgrade profiles from old to new schemas
- **Verification** to ensure migration integrity
- **Dry-run mode** for testing migrations before applying them

## Architecture

### Components

1. **types.ts** - Type definitions for migrations
2. **migrations.ts** - Registry of all schema migrations
3. **migrator.ts** - Migration execution service
4. **handlers/migration/index.ts** - Lambda handler for running migrations

### Profile Versioning

All profiles include a `version` field (default: 1). When the schema changes, increment `CURRENT_PROFILE_VERSION` and add a migration.

## Adding a New Migration

### Step 1: Define the Migration

Edit `migrations.ts` and add your migration:

```typescript
const migration_1_to_2: ProfileMigration = {
  fromVersion: 1,
  toVersion: 2,
  description: 'Add characterType field to character profiles',
  migrate: (profile: any) => ({
    ...profile,
    version: 2,
    profileData: {
      ...profile.profileData,
      characterType: profile.profileData.characterType || 'UNKNOWN',
    },
  }),
};

// Add to migrations array
export const migrations: ProfileMigration[] = [
  migration_1_to_2,
];
```

### Step 2: Update Current Version

Update `CURRENT_PROFILE_VERSION` in `types.ts`:

```typescript
export const CURRENT_PROFILE_VERSION = 2;
```

### Step 3: Test the Migration

Write tests in `__tests__/migrations.test.ts`:

```typescript
it('should migrate profile from v1 to v2', () => {
  const oldProfile = { version: 1, profileData: { name: 'Test' } };
  const result = applyMigrations(oldProfile, [migration_1_to_2]);
  
  expect(result.version).toBe(2);
  expect(result.profileData.characterType).toBeDefined();
});
```

### Step 4: Run the Migration

Deploy the new code, then invoke the migration Lambda:

```bash
# Dry run first (no changes)
aws lambda invoke \
  --function-name CICADA-Migration \
  --payload '{"dryRun": true}' \
  response.json

# Run actual migration
aws lambda invoke \
  --function-name CICADA-Migration \
  --payload '{}' \
  response.json

# Verify migration
aws lambda invoke \
  --function-name CICADA-Migration \
  --payload '{"verifyOnly": true}' \
  response.json
```

## Migration Process

### Recommended Workflow

1. **Develop migration** - Write and test migration code
2. **Deploy code** - Deploy new Lambda code with migration logic
3. **Dry run** - Test migration without making changes
4. **Backup data** - Create DynamoDB backup (optional but recommended)
5. **Run migration** - Execute migration on all profiles
6. **Verify** - Confirm all profiles migrated successfully
7. **Monitor** - Watch for any issues in production

### Lambda Event Parameters

```typescript
{
  targetVersion?: number;  // Version to migrate to (default: CURRENT_PROFILE_VERSION)
  dryRun?: boolean;        // Test without making changes (default: false)
  verifyOnly?: boolean;    // Only check if profiles are at target version (default: false)
}
```

### Response Format

```typescript
{
  success: boolean;
  message: string;
  summary?: {
    totalProfiles: number;
    successCount: number;
    failureCount: number;
    skippedCount: number;
    results: MigrationResult[];
  };
  verification?: {
    valid: boolean;
    invalidProfiles: Array<{
      userId: string;
      profileId: string;
      version: number;
    }>;
  };
  error?: string;
}
```

## Best Practices

### Migration Design

1. **Backward compatible** - Ensure old code can read new data
2. **Idempotent** - Running migration multiple times should be safe
3. **Preserve data** - Never delete data, only transform it
4. **Default values** - Provide sensible defaults for new fields
5. **Test thoroughly** - Test with real data before production

### Error Handling

- Migrations continue even if individual profiles fail
- Failed migrations are logged in the results
- Verification step catches any missed profiles
- Original data is preserved on failure

### Performance

- Migrations scan entire UserProfiles table
- For large datasets, consider:
  - Running during low-traffic periods
  - Implementing batch processing
  - Adding progress tracking

## Example Migrations

### Adding a New Field

```typescript
{
  fromVersion: 1,
  toVersion: 2,
  description: 'Add lastAccessedAt timestamp',
  migrate: (profile) => ({
    ...profile,
    version: 2,
    lastAccessedAt: profile.updatedAt || new Date().toISOString(),
  }),
}
```

### Renaming a Field

```typescript
{
  fromVersion: 2,
  toVersion: 3,
  description: 'Rename characterName to name',
  migrate: (profile) => ({
    ...profile,
    version: 3,
    profileData: {
      ...profile.profileData,
      name: profile.profileData.characterName,
      characterName: undefined, // Remove old field
    },
  }),
}
```

### Restructuring Data

```typescript
{
  fromVersion: 3,
  toVersion: 4,
  description: 'Move metadata into nested object',
  migrate: (profile) => ({
    ...profile,
    version: 4,
    profileData: {
      ...profile.profileData,
      metadata: {
        createdBy: profile.profileData.createdBy,
        tags: profile.profileData.tags || [],
      },
      createdBy: undefined,
      tags: undefined,
    },
  }),
}
```

## Troubleshooting

### Migration Fails

1. Check CloudWatch logs for error details
2. Verify DynamoDB table permissions
3. Check if profiles have unexpected data structure
4. Run verification to identify problematic profiles

### Partial Migration

If some profiles fail:
1. Review failed profile IDs in results
2. Fix migration logic for edge cases
3. Re-run migration (idempotent design ensures safety)

### Rollback

If migration causes issues:
1. Restore from DynamoDB backup
2. Deploy previous code version
3. Investigate and fix migration logic
4. Test thoroughly before re-attempting

## Monitoring

After migration, monitor:
- Application logs for errors
- Profile access patterns
- User-reported issues
- Data integrity checks

## Future Enhancements

Potential improvements:
- Progress tracking for long migrations
- Parallel processing for better performance
- Automatic rollback on failure
- Migration history tracking
- Scheduled migrations during maintenance windows
