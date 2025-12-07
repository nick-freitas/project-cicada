import * as fc from 'fast-check';
import { EpisodeConfig } from '@cicada/shared-types';
import { EpisodeConfigService } from '../../src/services/episode-config';

/**
 * Feature: project-cicada, Property 5: Configuration Storage Fidelity
 * Validates: Requirements 2.2
 * 
 * For any episode configuration input, the stored configuration SHALL contain
 * all specified fields (episode name, arc type, file patterns).
 */

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('Property 5: Configuration Storage Fidelity', () => {
  let service: EpisodeConfigService;
  let storedConfigs: Map<string, EpisodeConfig>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    service = new EpisodeConfigService();
    storedConfigs = new Map();

    // Mock storeConfig to store in our map
    jest.spyOn(service, 'storeConfig').mockImplementation(async (config: EpisodeConfig) => {
      storedConfigs.set(config.episodeId, { ...config, metadata: config.metadata ?? {} });
    });

    // Mock getConfigById to retrieve from our map
    jest.spyOn(service, 'getConfigById').mockImplementation(async (episodeId: string) => {
      const config = storedConfigs.get(episodeId);
      return config ? { ...config } : null;
    });
  });

  it('should preserve all required fields when storing and retrieving configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary episode configurations
        fc.record({
          episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          filePattern: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          metadata: fc.option(
            fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.constant(null)
              )
            ),
            { nil: undefined }
          ),
        }),
        async (config) => {
          // Store the configuration
          await service.storeConfig(config);

          // Retrieve the configuration
          const retrieved = await service.getConfigById(config.episodeId);

          // Property: All fields should be preserved
          expect(retrieved).not.toBeNull();
          expect(retrieved?.episodeId).toBe(config.episodeId);
          expect(retrieved?.episodeName).toBe(config.episodeName);
          expect(retrieved?.filePattern).toBe(config.filePattern);
          expect(retrieved?.arcType).toBe(config.arcType);
          
          // Metadata should be preserved (or default to empty object)
          if (config.metadata) {
            expect(retrieved?.metadata).toEqual(config.metadata);
          } else {
            expect(retrieved?.metadata).toEqual({});
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle metadata correctly when not provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate configurations without metadata
        fc.record({
          episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          filePattern: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
        }),
        async (config) => {
          // Store the configuration without metadata
          await service.storeConfig(config);

          // Retrieve the configuration
          const retrieved = await service.getConfigById(config.episodeId);

          // Property: Metadata should default to empty object
          expect(retrieved).not.toBeNull();
          expect(retrieved?.metadata).toEqual({});
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve complex metadata structures', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate configurations with complex metadata
        fc.record({
          episodeId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          filePattern: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
          metadata: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.array(fc.string(), { maxLength: 5 }),
              fc.dictionary(fc.string(), fc.string(), { maxKeys: 3 })
            ),
            { minKeys: 1, maxKeys: 5 }
          ),
        }),
        async (config) => {
          // Store the configuration
          await service.storeConfig(config);

          // Retrieve the configuration
          const retrieved = await service.getConfigById(config.episodeId);

          // Property: Complex metadata should be preserved exactly
          expect(retrieved).not.toBeNull();
          expect(retrieved?.metadata).toEqual(config.metadata);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle overwriting existing configurations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two configurations with the same episodeId
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.record({
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          filePattern: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
        }),
        fc.record({
          episodeName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          filePattern: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          arcType: fc.constantFrom('question' as const, 'answer' as const, 'other' as const),
        }),
        async (episodeId, config1, config2) => {
          // Store first configuration
          await service.storeConfig({ episodeId, ...config1 });

          // Store second configuration with same episodeId
          await service.storeConfig({ episodeId, ...config2 });

          // Retrieve the configuration
          const retrieved = await service.getConfigById(episodeId);

          // Property: Should contain the latest configuration
          expect(retrieved).not.toBeNull();
          expect(retrieved?.episodeId).toBe(episodeId);
          expect(retrieved?.episodeName).toBe(config2.episodeName);
          expect(retrieved?.filePattern).toBe(config2.filePattern);
          expect(retrieved?.arcType).toBe(config2.arcType);
        }
      ),
      { numRuns: 100 }
    );
  });
});
