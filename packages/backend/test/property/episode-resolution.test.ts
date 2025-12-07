import * as fc from 'fast-check';
import { EpisodeConfig } from '@cicada/shared-types';
import { EpisodeConfigService } from '../../src/services/episode-config';

/**
 * Feature: project-cicada, Property 4: Episode Resolution Correctness
 * Validates: Requirements 1.4, 2.3
 * 
 * For any chapter filename and episode configuration, the resolved episode
 * SHALL match the pattern defined in the configuration.
 */

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('Property 4: Episode Resolution Correctness', () => {
  let service: EpisodeConfigService;
  let mockConfigs: EpisodeConfig[];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    service = new EpisodeConfigService();
    mockConfigs = [];

    // Mock getAllConfigs to return our test configs
    jest.spyOn(service, 'getAllConfigs').mockImplementation(async () => mockConfigs);
  });

  it('should resolve episodes correctly for any filename matching the pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary episode configurations
        fc.record({
          episodeId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          episodeName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          filePattern: fc.oneof(
            // Simple prefix patterns
            fc.string({ minLength: 1, maxLength: 15 }).map(s => `${s.replace(/[^a-z0-9_]/gi, '')}_*`),
            // Exact match patterns
            fc.string({ minLength: 1, maxLength: 15 }).map(s => s.replace(/[^a-z0-9_]/gi, '')),
            // Patterns with wildcards in middle
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.string({ minLength: 1, maxLength: 10 })
            ).map(([a, b]) => `${a.replace(/[^a-z0-9_]/gi, '')}_*_${b.replace(/[^a-z0-9_]/gi, '')}`)
          ),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
        }),
        // Generate a filename that should match the pattern
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        async (config, randomSuffix) => {
          // Set up the mock config
          mockConfigs = [config];

          // Generate a filename that matches the pattern
          const filename = generateMatchingFilename(config.filePattern, randomSuffix);

          // Resolve the episode
          const resolved = await service.resolveEpisodeFromFilename(filename);

          // Property: The resolved episode should match the configuration
          expect(resolved).not.toBeNull();
          expect(resolved?.episodeId).toBe(config.episodeId);
          expect(resolved?.episodeName).toBe(config.episodeName);
          expect(resolved?.filePattern).toBe(config.filePattern);
          expect(resolved?.arcType).toBe(config.arcType);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not resolve episodes for filenames that do not match any pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate episode configurations with specific patterns
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            episodeName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            filePattern: fc.string({ minLength: 1, maxLength: 15 }).map(s => `${s.replace(/[^a-z0-9_]/gi, '')}_*`),
            arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate a filename that definitely doesn't match
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        async (configs, filename) => {
          // Set up the mock configs
          mockConfigs = configs;

          // Ensure filename doesn't match any pattern
          const nonMatchingFilename = `NOMATCH_${filename.replace(/[^a-z0-9]/gi, '')}_UNIQUE`;

          // Resolve the episode
          const resolved = await service.resolveEpisodeFromFilename(nonMatchingFilename);

          // Property: Should return null for non-matching filenames
          expect(resolved).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should resolve the correct episode when multiple configurations exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple episode configurations with distinct patterns
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            episodeName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            filePattern: fc.string({ minLength: 1, maxLength: 15 }).map(s => `${s.replace(/[^a-z0-9_]/gi, '')}_*`),
            arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        fc.integer({ min: 0, max: 4 }),
        async (configs, targetIndex) => {
          // Ensure we have at least one config and valid index
          if (configs.length === 0) return;
          const actualIndex = targetIndex % configs.length;

          // Set up the mock configs
          mockConfigs = configs;

          // Generate a filename that matches the target config
          const targetConfig = configs[actualIndex];
          const filename = generateMatchingFilename(targetConfig.filePattern, 'test');

          // Resolve the episode
          const resolved = await service.resolveEpisodeFromFilename(filename);

          // Property: Should resolve to the correct episode
          expect(resolved).not.toBeNull();
          expect(resolved?.episodeId).toBe(targetConfig.episodeId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper function to generate a filename that matches a given pattern
 */
function generateMatchingFilename(pattern: string, suffix: string): string {
  // Replace wildcards with the suffix
  const cleanSuffix = suffix.replace(/[^a-z0-9_]/gi, '');
  return pattern.replace(/\*/g, cleanSuffix || 'test');
}
