import * as fc from 'fast-check';
import { semanticSearch, ScriptEmbedding } from '../../src/services/knowledge-base-service';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Feature: project-cicada, Property 7: Episode Boundary Enforcement
 * 
 * For any query scoped to specific episodes, all returned passages 
 * SHALL belong only to those episodes.
 * 
 * Validates: Requirements 3.2, 11.1, 11.3
 */

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 7: Episode Boundary Enforcement', () => {
  // Generator for episode IDs
  const episodeIdArbitrary = fc.oneof(
    fc.constantFrom('onikakushi', 'watanagashi', 'tatarigoroshi', 'himatsubushi'),
    fc.string({ minLength: 5, maxLength: 15 }).map(s => s.replace(/[^a-z0-9]/gi, '').toLowerCase())
  );

  // Generator for script embeddings
  const scriptEmbeddingArbitrary = fc.record({
    id: fc.uuid(),
    episodeId: episodeIdArbitrary,
    chapterId: fc.string({ minLength: 1, maxLength: 20 }),
    messageId: fc.integer({ min: 1, max: 10000 }),
    speaker: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    textENG: fc.string({ minLength: 10, maxLength: 200 }),
    textJPN: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    embedding: fc.array(fc.float({ min: -1, max: 1 }), { minLength: 1536, maxLength: 1536 }),
    metadata: fc.record({
      episodeName: fc.string({ minLength: 5, maxLength: 30 }),
    }),
  });

  // Helper to setup mocks for a given set of embeddings
  const setupMocks = (embeddings: ScriptEmbedding[]) => {
    // Mock Bedrock to return a fixed embedding
    const mockQueryEmbedding = Array(1536).fill(0).map(() => Math.random() * 2 - 1);
    (BedrockRuntimeClient.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ embedding: mockQueryEmbedding })),
    });

    // Mock S3 to return our test embeddings
    (S3Client.prototype.send as jest.Mock) = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;
      
      if (commandName === 'ListObjectsV2Command') {
        // Filter embeddings by the prefix (episode ID)
        const prefix = command.input?.Prefix || '';
        const episodeId = prefix.split('/')[1];
        
        const filteredEmbeddings = episodeId
          ? embeddings.filter(e => e.episodeId === episodeId)
          : embeddings;

        return Promise.resolve({
          Contents: filteredEmbeddings.map(e => ({
            Key: `embeddings/${e.episodeId}/${e.chapterId}/${e.id}.json`,
          })),
        });
      }
      
      if (commandName === 'GetObjectCommand') {
        // Extract the embedding ID from the key
        const key = command.input?.Key || '';
        const id = key.split('/').pop()?.replace('.json', '');
        const embedding = embeddings.find(e => e.id === id);
        
        if (embedding) {
          return Promise.resolve({
            Body: {
              transformToString: async () => JSON.stringify(embedding),
            },
          });
        }
      }
      
      return Promise.resolve({});
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only return passages from specified episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a set of embeddings from different episodes
        fc.array(scriptEmbeddingArbitrary, { minLength: 10, maxLength: 50 }),
        // Generate a subset of episode IDs to filter by
        fc.array(episodeIdArbitrary, { minLength: 1, maxLength: 3 }),
        // Generate a query string
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, targetEpisodeIds, query) => {
          // Ensure we have at least some embeddings from the target episodes
          const uniqueTargetEpisodes = [...new Set(targetEpisodeIds)];
          
          // Setup mocks with the generated embeddings
          setupMocks(embeddings);

          // Act: Perform semantic search with episode filter
          const results = await semanticSearch(query, {
            episodeIds: uniqueTargetEpisodes,
            topK: 100,
            minScore: 0.0, // Accept all scores to test filtering
          });

          // Assert: All results should belong to the specified episodes
          for (const result of results) {
            expect(uniqueTargetEpisodes).toContain(result.episodeId);
          }

          // Assert: No results should be from other episodes
          const resultEpisodeIds = new Set(results.map(r => r.episodeId));
          for (const episodeId of resultEpisodeIds) {
            expect(uniqueTargetEpisodes).toContain(episodeId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty results when no embeddings match the episode filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate embeddings from specific episodes
        fc.array(
          scriptEmbeddingArbitrary.map(e => ({
            ...e,
            episodeId: 'onikakushi',
          })),
          { minLength: 5, maxLength: 20 }
        ),
        // Generate a query string
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          // Setup mocks with the generated embeddings
          setupMocks(embeddings);

          // Act: Search for episodes that don't exist in our dataset
          const results = await semanticSearch(query, {
            episodeIds: ['tatarigoroshi', 'himatsubushi'], // Episodes not in our test data
            topK: 100,
            minScore: 0.0,
          });

          // Assert: Should return empty results
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should enforce episode boundaries even with high similarity scores', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate embeddings with specific episode IDs
        fc.tuple(
          fc.array(
            scriptEmbeddingArbitrary.map(e => ({
              ...e,
              episodeId: 'target-episode',
            })),
            { minLength: 3, maxLength: 10 }
          ),
          fc.array(
            scriptEmbeddingArbitrary.map(e => ({
              ...e,
              episodeId: 'other-episode',
            })),
            { minLength: 3, maxLength: 10 }
          )
        ),
        fc.string({ minLength: 5, maxLength: 50 }),
        async ([targetEmbeddings, otherEmbeddings], query) => {
          const allEmbeddings = [...targetEmbeddings, ...otherEmbeddings];

          // Setup mocks with the generated embeddings
          setupMocks(allEmbeddings);

          // Act: Search only for target episode
          const results = await semanticSearch(query, {
            episodeIds: ['target-episode'],
            topK: 100,
            minScore: 0.0,
          });

          // Assert: All results must be from target episode only
          for (const result of results) {
            expect(result.episodeId).toBe('target-episode');
          }

          // Assert: No results from other episodes
          const otherEpisodeResults = results.filter(r => r.episodeId === 'other-episode');
          expect(otherEpisodeResults).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
