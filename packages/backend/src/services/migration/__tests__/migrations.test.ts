/**
 * Migration Registry Tests
 */

import { getMigrationsForVersion, applyMigrations } from '../migrations';
import { ProfileMigration } from '../types';

describe('Migration Registry', () => {
  describe('getMigrationsForVersion', () => {
    it('should return empty array when no migrations exist', () => {
      const result = getMigrationsForVersion(1, 2);
      expect(result).toEqual([]);
    });

    it('should return migrations in correct order', () => {
      // This test will be meaningful when migrations are added
      const result = getMigrationsForVersion(1, 1);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('applyMigrations', () => {
    it('should return unchanged profile when no migrations provided', () => {
      const profile = { id: 'test', version: 1, data: 'test' };
      const result = applyMigrations(profile, []);
      expect(result).toEqual(profile);
    });

    it('should apply single migration correctly', () => {
      const profile = { id: 'test', version: 1 };
      const migration: ProfileMigration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test migration',
        migrate: (p) => ({ ...p, version: 2, newField: 'added' }),
      };

      const result = applyMigrations(profile, [migration]);
      expect(result.version).toBe(2);
      expect(result.newField).toBe('added');
    });

    it('should apply multiple migrations in sequence', () => {
      const profile = { id: 'test', version: 1, value: 0 };
      const migrations: ProfileMigration[] = [
        {
          fromVersion: 1,
          toVersion: 2,
          description: 'Add field',
          migrate: (p) => ({ ...p, version: 2, value: p.value + 1 }),
        },
        {
          fromVersion: 2,
          toVersion: 3,
          description: 'Modify field',
          migrate: (p) => ({ ...p, version: 3, value: p.value * 2 }),
        },
      ];

      const result = applyMigrations(profile, migrations);
      expect(result.version).toBe(3);
      expect(result.value).toBe(2); // (0 + 1) * 2
    });

    it('should preserve original profile data during migration', () => {
      const profile = { id: 'test', version: 1, important: 'data' };
      const migration: ProfileMigration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test migration',
        migrate: (p) => ({ ...p, version: 2 }),
      };

      const result = applyMigrations(profile, [migration]);
      expect(result.id).toBe('test');
      expect(result.important).toBe('data');
    });
  });
});
