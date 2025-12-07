import * as fc from 'fast-check';
import { EpisodeConfig } from '@cicada/shared-types';
import { EpisodeConfigService } from '../../src/services/episode-config';

/**
 * Feature: project-cicada, Property 6: Query Name Equivalence
 * Validates: Requirements 2.5
 * 
 * For any episode, querying by file pattern or human-readable name SHALL
 * return the same episode data.
 */

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('Property 6: Query Name Equivalence', () => {
  let service: EpisodeConfigService;
  let mockConfigs: EpisodeConfig[];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    service = new EpisodeConfigService();
    mockConfigs = [];

    // Mock getAllConfigs to return our test configs
    jest.spyOn(service, 'getAllConfigs').mockImplementation(async () => mockConfigs);

    // Mock getConfigById
    jest.spyOn(service, 'getConfigById').mockImplementation(async (episodeId: string) => {
      const config = mockConfigs.find(c => c.episodeId === episodeId);
      return config || null;
    });
  });

  it('should return the same episode when queried by episodeId, episodeName, or matching filename', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary episode configuration
        fc.record({
          episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          filePattern: fc.string({ minLength: 1, maxLength: 15 }).map(s => `${s.replace(/[^a-z0-9_]/gi, '')}_*`),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          metadata: fc.option(
            fc.dictionary(fc.string(), fc.string()),
            { nil: undefined }
          ),
        }),
        async (config) => {
          // Set up the mock config
          mockConfigs = [config];

          // Query by episodeId
          const byId = await service.queryEpisode(config.episodeId);

          // Query by episodeName
          const byName = await service.queryEpisode(config.episodeName);

          // Query by matching filename
          const matchingFilename = config.filePattern.replace(/\*/g, 'test');
          const byFilename = await service.queryEpisode(matchingFilename);

          // Property: All queries should return the same episode data
          expect(byId).not.toBeNull();
          expect(byName).not.toBeNull();
          expect(byFilename).not.toBeNull();

          // All should have the same episodeId
          expect(byId?.episodeId).toBe(config.episodeId);
          expect(byName?.episodeId).toBe(config.episodeId);
          expect(byFilename?.episodeId).toBe(config.episodeId);

          // All should have the same episodeName
          expect(byId?.episodeName).toBe(config.episodeName);
          expect(byName?.episodeName).toBe(config.episodeName);
          expect(byFilename?.episodeName).toBe(config.episodeName);

          // All should have the same filePattern
          expect(byId?.filePattern).toBe(config.filePattern);
          expect(byName?.filePattern).toBe(config.filePattern);
          expect(byFilename?.filePattern).toBe(config.filePattern);

          // All should have the same arcType
          expect(byId?.arcType).toBe(config.arcType);
          expect(byName?.arcType).toBe(config.arcType);
          expect(byFilename?.arcType).toBe(config.arcType);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle case-insensitive episode name queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate episode configuration with mixed-case name
        fc.record({
          episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s)),
          filePattern: fc.string({ minLength: 1, maxLength: 15 }).map(s => `${s.replace(/[^a-z0-9_]/gi, '')}_*`),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
        }),
        async (config) => {
          // Set up the mock config
          mockConfigs = [config];

          // Query with different case variations
          const lowercase = await service.queryEpisode(config.episodeName.toLowerCase());
          const uppercase = await service.queryEpisode(config.episodeName.toUpperCase());
          const original = await service.queryEpisode(config.episodeName);

          // Property: All case variations should return the same episode
          expect(lowercase?.episodeId).toBe(config.episodeId);
          expect(uppercase?.episodeId).toBe(config.episodeId);
          expect(original?.episodeId).toBe(config.episodeId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return the same episode when multiple configs exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple episode configurations with unique patterns
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            patternPrefix: fc.string({ minLength: 1, maxLength: 15 }).map(s => s.replace(/[^a-z0-9_]/gi, '') || 'ep'),
            arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          }),
          { minLength: 2, maxLength: 5 }
        ).filter(configs => {
          // Ensure unique episodeIds, episodeNames, and pattern prefixes
          const ids = new Set(configs.map(c => c.episodeId));
          const names = new Set(configs.map(c => c.episodeName.toLowerCase()));
          const patterns = new Set(configs.map(c => c.patternPrefix));
          return ids.size === configs.length && names.size === configs.length && patterns.size === configs.length;
        }),
        fc.integer({ min: 0, max: 4 }),
        async (configs, targetIndex) => {
          // Ensure we have configs and valid index
          if (configs.length === 0) return;
          const actualIndex = targetIndex % configs.length;

          // Convert to EpisodeConfig with unique patterns
          const episodeConfigs = configs.map(c => ({
            episodeId: c.episodeId,
            episodeName: c.episodeName,
            filePattern: `${c.patternPrefix}_*`,
            arcType: c.arcType,
          }));

          // Set up the mock configs
          mockConfigs = episodeConfigs;

          const targetConfig = episodeConfigs[actualIndex];

          // Query by different methods
          const byId = await service.queryEpisode(targetConfig.episodeId);
          const byName = await service.queryEpisode(targetConfig.episodeName);
          // Use the unique pattern prefix to generate a matching filename
          const matchingFilename = targetConfig.filePattern.replace(/\*/g, 'test');
          const byFilename = await service.queryEpisode(matchingFilename);

          // Property: All queries should return the same target episode
          expect(byId?.episodeId).toBe(targetConfig.episodeId);
          expect(byName?.episodeId).toBe(targetConfig.episodeId);
          expect(byFilename?.episodeId).toBe(targetConfig.episodeId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null for non-existent queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate episode configurations
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            filePattern: fc.string({ minLength: 1, maxLength: 15 }).map(s => `${s.replace(/[^a-z0-9_]/gi, '')}_*`),
            arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (configs, nonExistentQuery) => {
          // Set up the mock configs
          mockConfigs = configs;

          // Ensure the query doesn't match any config
          const uniqueQuery = `NONEXISTENT_${nonExistentQuery}_UNIQUE_12345`;

          // Query with non-existent value
          const result = await service.queryEpisode(uniqueQuery);

          // Property: Should return null for non-existent queries
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
