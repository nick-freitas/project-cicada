import * as fc from 'fast-check';
import { semanticSearch, groupResultsByEpisode, ScriptEmbedding } from '../../src/services/knowledge-base-service';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Feature: project-cicada, Property 9: Episode Grouping in Results
 * 
 * For any search returning passages from multiple episodes, 
 * results SHALL be grouped by episode.
 * 
 * Validates: Requirements 3.5
 */

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 9: Episode Grouping in Results', () => {
  // Generator for episode IDs
  const episodeIdArbitrary = fc.oneof(
    fc.constantFrom('onikakushi', 'watanagashi', 'tatarigoroshi', 'himatsubushi'),
    fc.string({ minLength: 5, maxLength: 15 }).map((s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()),
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
    const mockQueryEmbedding = Array(1536)
      .fill(0)
      .map(() => Math.random() * 2 - 1);
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
          ? embeddings.filter((e) => e.episodeId === episodeId)
          : embeddings;

        return Promise.resolve({
          Contents: filteredEmbeddings.map((e) => ({
            Key: `embeddings/${e.episodeId}/${e.chapterId}/${e.id}.json`,
          })),
        });
      }

      if (commandName === 'GetObjectCommand') {
        // Extract the embedding ID from the key
        const key = command.input?.Key || '';
        const id = key.split('/').pop()?.replace('.json', '');
        const embedding = embeddings.find((e) => e.id === id);

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

  it('should group results by episode ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Group the results
          const grouped = groupResultsByEpisode(results);

          // Assert: Each group should only contain results from one episode
          for (const [episodeId, episodeResults] of grouped.entries()) {
            for (const result of episodeResults) {
              expect(result.episodeId).toBe(episodeId);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should include all results in grouped output', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Group the results
          const grouped = groupResultsByEpisode(results);

          // Assert: Total count of grouped results should equal original results
          let totalGroupedResults = 0;
          for (const episodeResults of grouped.values()) {
            totalGroupedResults += episodeResults.length;
          }

          expect(totalGroupedResults).toBe(results.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should create one group per unique episode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Group the results
          const grouped = groupResultsByEpisode(results);

          // Get unique episode IDs from results
          const uniqueEpisodeIds = new Set(results.map((r) => r.episodeId));

          // Assert: Number of groups should equal number of unique episodes
          expect(grouped.size).toBe(uniqueEpisodeIds.size);

          // Assert: Each unique episode should have a group
          for (const episodeId of uniqueEpisodeIds) {
            expect(grouped.has(episodeId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve result order within each episode group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Group the results
          const grouped = groupResultsByEpisode(results);

          // Assert: Results within each group should maintain their relative order
          for (const [episodeId, episodeResults] of grouped.entries()) {
            // Get the original indices of these results
            const originalIndices = episodeResults.map((result) => results.findIndex((r) => r.id === result.id));

            // Check that indices are in ascending order (preserving original order)
            for (let i = 1; i < originalIndices.length; i++) {
              expect(originalIndices[i]).toBeGreaterThan(originalIndices[i - 1]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle single-episode results correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          scriptEmbeddingArbitrary.map((e) => ({
            ...e,
            episodeId: 'single-episode',
          })),
          { minLength: 5, maxLength: 20 },
        ),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Group the results
          const grouped = groupResultsByEpisode(results);

          // Assert: Should have exactly one group
          expect(grouped.size).toBe(results.length > 0 ? 1 : 0);

          if (results.length > 0) {
            // Assert: The single group should contain all results
            const singleGroup = grouped.get('single-episode');
            expect(singleGroup).toBeDefined();
            expect(singleGroup!.length).toBe(results.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle empty results correctly', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 5, maxLength: 50 }), async (query) => {
        setupMocks([]);

        const results = await semanticSearch(query, {
          topK: 100,
          minScore: 0.0,
        });

        // Group the results
        const grouped = groupResultsByEpisode(results);

        // Assert: Should have no groups
        expect(grouped.size).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
