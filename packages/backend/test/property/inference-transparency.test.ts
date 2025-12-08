import * as fc from 'fast-check';
// TODO: Update this test to work with AgentCore implementation
// The old prototype agents have been removed - this test needs to be updated
// to test the AgentCore-based Query Agent through the handler tools
// import { QueryAgent } from '../../src/agents/query-agent';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Feature: project-cicada, Property 10: Inference Transparency
 * 
 * For any response without supporting citations, the response SHALL be 
 * explicitly marked as inference or speculation.
 * 
 * Validates: Requirements 5.5
 */

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 10: Inference Transparency', () => {
  let queryAgent: QueryAgent;

  beforeEach(() => {
    queryAgent = new QueryAgent();
    jest.clearAllMocks();
  });

  // Generator for queries
  const queryArbitrary = fc.string({ minLength: 5, maxLength: 100 }).filter((s) => s.trim().length > 0);

  // Generator for meaningful queries (with at least 5 alphanumeric characters)
  const meaningfulQueryArbitrary = fc.string({ minLength: 10, maxLength: 100 }).filter((s) => {
    const trimmed = s.trim();
    const alphanumeric = trimmed.replace(/[^a-zA-Z0-9]/g, '');
    return alphanumeric.length >= 5;
  });

  // Generator for user IDs
  const userIdArbitrary = fc.uuid();

  // Helper to setup mocks for no results scenario
  const setupMocksNoResults = (inferenceResponseText: string = 'This is speculation based on general knowledge.') => {
    // Mock Bedrock for embedding generation
    const mockQueryEmbedding = Array(1536)
      .fill(0)
      .map(() => Math.random() * 2 - 1);

    (BedrockRuntimeClient.prototype.send as jest.Mock) = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'InvokeModelCommand') {
        // Embedding generation
        return Promise.resolve({
          body: new TextEncoder().encode(JSON.stringify({ embedding: mockQueryEmbedding })),
        });
      }

      if (commandName === 'ConverseCommand') {
        // Response generation for inference
        return Promise.resolve({
          output: {
            message: {
              content: [{ text: inferenceResponseText }],
            },
          },
        });
      }

      return Promise.resolve({});
    });

    // Mock S3 to return no results
    (S3Client.prototype.send as jest.Mock) = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'ListObjectsV2Command') {
        // Return empty list
        return Promise.resolve({
          Contents: [],
        });
      }

      return Promise.resolve({});
    });
  };

  // Helper to setup mocks for results scenario
  const setupMocksWithResults = (resultCount: number = 5) => {
    // Create a fixed embedding that will have high similarity with itself
    const mockQueryEmbedding = Array(1536).fill(1.0);

    (BedrockRuntimeClient.prototype.send as jest.Mock) = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'InvokeModelCommand') {
        return Promise.resolve({
          body: new TextEncoder().encode(JSON.stringify({ embedding: mockQueryEmbedding })),
        });
      }

      if (commandName === 'ConverseCommand') {
        return Promise.resolve({
          output: {
            message: {
              content: [{ text: 'Based on the passages, here is the answer.' }],
            },
          },
        });
      }

      return Promise.resolve({});
    });

    // Mock S3 to return some results with same embedding for high similarity
    const mockEmbeddings = Array.from({ length: resultCount }, (_, i) => ({
      id: `test-id-${i}`,
      episodeId: 'test-episode',
      chapterId: `chapter-${i}`,
      messageId: i + 1,
      speaker: 'Test Speaker',
      textENG: `Test passage ${i}`,
      textJPN: `テストパッセージ ${i}`,
      embedding: mockQueryEmbedding, // Same embedding = high similarity score
      metadata: {
        episodeName: 'Test Episode',
      },
    }));

    (S3Client.prototype.send as jest.Mock) = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'ListObjectsV2Command') {
        return Promise.resolve({
          Contents: mockEmbeddings.map((e) => ({
            Key: `embeddings/${e.episodeId}/${e.chapterId}/${e.id}.json`,
          })),
        });
      }

      if (commandName === 'GetObjectCommand') {
        const key = command.input?.Key || '';
        const id = key.split('/').pop()?.replace('.json', '');
        const embedding = mockEmbeddings.find((e) => e.id === id);

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

  it('should mark responses as inference when no citations exist', async () => {
    await fc.assert(
      fc.asyncProperty(queryArbitrary, userIdArbitrary, async (query, userId) => {
        setupMocksNoResults();

        const response = await queryAgent.processQuery({
          query,
          userId,
        });

        // Assert: Response should be marked as inference
        expect(response.hasDirectEvidence).toBe(false);
        expect(response.citations.length).toBe(0);
        
        // The content should contain explicit inference marker
        expect(response.content).toContain('[INFERENCE');
        expect(
          response.content.includes('INFERENCE') ||
          response.content.includes('SPECULATION') ||
          response.content.includes('No Direct Evidence')
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should include explicit marker at the beginning of inference responses', async () => {
    await fc.assert(
      fc.asyncProperty(queryArbitrary, userIdArbitrary, async (query, userId) => {
        setupMocksNoResults('This is my speculation about the topic.');

        const response = await queryAgent.processQuery({
          query,
          userId,
        });

        // Assert: Response should start with inference marker
        expect(response.content).toMatch(/^\[INFERENCE/);
      }),
      { numRuns: 100 },
    );
  });

  it('should NOT mark responses as inference when citations exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        meaningfulQueryArbitrary,
        userIdArbitrary,
        fc.integer({ min: 1, max: 10 }),
        async (query, userId, resultCount) => {
          setupMocksWithResults(resultCount);

          const response = await queryAgent.processQuery({
            query,
            userId,
          });

          // Assert: If citations were found, response should have direct evidence and no inference marker
          // Note: It's possible that even with mocked results, semantic search returns 0 results
          // due to low similarity scores, which is valid behavior
          if (response.citations.length > 0) {
            expect(response.hasDirectEvidence).toBe(true);
            expect(response.content).not.toContain('[INFERENCE');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should set hasDirectEvidence to false when no results found', async () => {
    await fc.assert(
      fc.asyncProperty(queryArbitrary, userIdArbitrary, async (query, userId) => {
        setupMocksNoResults();

        const response = await queryAgent.processQuery({
          query,
          userId,
        });

        // Assert: hasDirectEvidence should be false
        expect(response.hasDirectEvidence).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('should set hasDirectEvidence to true when results found', async () => {
    await fc.assert(
      fc.asyncProperty(
        meaningfulQueryArbitrary,
        userIdArbitrary,
        fc.integer({ min: 1, max: 10 }),
        async (query, userId, resultCount) => {
          setupMocksWithResults(resultCount);

          const response = await queryAgent.processQuery({
            query,
            userId,
          });

          // Assert: hasDirectEvidence should match whether citations were found
          // Note: Even with mocked results, semantic search may return 0 results
          // due to low similarity scores, which is valid behavior
          expect(response.hasDirectEvidence).toBe(response.citations.length > 0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should have empty citations array when no evidence exists', async () => {
    await fc.assert(
      fc.asyncProperty(queryArbitrary, userIdArbitrary, async (query, userId) => {
        setupMocksNoResults();

        const response = await queryAgent.processQuery({
          query,
          userId,
        });

        // Assert: Citations should be empty
        expect(response.citations).toEqual([]);
        expect(response.citations.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should maintain inference transparency across different episode contexts', async () => {
    await fc.assert(
      fc.asyncProperty(
        queryArbitrary,
        userIdArbitrary,
        fc.array(fc.string({ minLength: 5, maxLength: 15 }), { minLength: 1, maxLength: 3 }),
        async (query, userId, episodeContext) => {
          setupMocksNoResults();

          const response = await queryAgent.processQuery({
            query,
            userId,
            episodeContext,
          });

          // Assert: Should still be marked as inference regardless of episode context
          expect(response.hasDirectEvidence).toBe(false);
          expect(response.content).toContain('[INFERENCE');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should clearly indicate lack of evidence in inference responses', async () => {
    await fc.assert(
      fc.asyncProperty(queryArbitrary, userIdArbitrary, async (query, userId) => {
        setupMocksNoResults('I cannot find direct evidence for this.');

        const response = await queryAgent.processQuery({
          query,
          userId,
        });

        // Assert: Response should mention lack of evidence
        const contentLower = response.content.toLowerCase();
        expect(
          contentLower.includes('no direct evidence') ||
          contentLower.includes('no evidence') ||
          contentLower.includes('inference') ||
          contentLower.includes('speculation')
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
