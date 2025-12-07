import * as fc from 'fast-check';
import { semanticSearch, ScriptEmbedding } from '../../src/services/knowledge-base-service';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Feature: project-cicada, Property 8: Citation Completeness
 * 
 * For any retrieved passage, the citation SHALL include episode name, 
 * chapter number, MessageID, speaker (if present), and full text.
 * 
 * Validates: Requirements 3.4, 5.1, 5.2, 5.3
 */

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 8: Citation Completeness', () => {
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

  it('should include episode name in all results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Assert: All results must have episodeName
          for (const result of results) {
            expect(result.episodeName).toBeDefined();
            expect(typeof result.episodeName).toBe('string');
            expect(result.episodeName.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should include chapter ID in all results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Assert: All results must have chapterId
          for (const result of results) {
            expect(result.chapterId).toBeDefined();
            expect(typeof result.chapterId).toBe('string');
            expect(result.chapterId.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should include message ID in all results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Assert: All results must have messageId
          for (const result of results) {
            expect(result.messageId).toBeDefined();
            expect(typeof result.messageId).toBe('number');
            expect(result.messageId).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should include full English text in all results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Assert: All results must have textENG
          for (const result of results) {
            expect(result.textENG).toBeDefined();
            expect(typeof result.textENG).toBe('string');
            expect(result.textENG.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should include speaker when present in source data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          scriptEmbeddingArbitrary.map((e) => ({
            ...e,
            speaker: fc.sample(fc.string({ minLength: 1, maxLength: 30 }), 1)[0],
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

          // Assert: All results must have speaker since all source data has speaker
          for (const result of results) {
            expect(result.speaker).toBeDefined();
            expect(typeof result.speaker).toBe('string');
            expect(result.speaker!.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve all citation fields from source embedding', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          const results = await semanticSearch(query, {
            topK: 100,
            minScore: 0.0,
          });

          // Assert: Each result should match its source embedding
          for (const result of results) {
            const sourceEmbedding = embeddings.find((e) => e.id === result.id);
            expect(sourceEmbedding).toBeDefined();

            if (sourceEmbedding) {
              expect(result.episodeId).toBe(sourceEmbedding.episodeId);
              expect(result.chapterId).toBe(sourceEmbedding.chapterId);
              expect(result.messageId).toBe(sourceEmbedding.messageId);
              expect(result.textENG).toBe(sourceEmbedding.textENG);
              expect(result.textJPN).toBe(sourceEmbedding.textJPN);
              expect(result.speaker).toBe(sourceEmbedding.speaker);
              expect(result.episodeName).toBe(sourceEmbedding.metadata.episodeName);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
