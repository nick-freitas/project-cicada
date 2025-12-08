import * as fc from 'fast-check';
import { 
  searchKnowledgeBase, 
  formatCitation,
  SearchKnowledgeBaseInput,
  FormatCitationInput 
} from '../../src/handlers/agents/query-agent-tools';
import { semanticSearch, ScriptEmbedding } from '../../src/services/knowledge-base-service';
import { Citation } from '@cicada/shared-types';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Feature: agentcore-implementation, Property 4: Citation Preservation
 * 
 * For any query processed by the Query Agent, all citations in the AgentCore 
 * implementation should match the citations from the prototype implementation.
 * 
 * This test validates that:
 * 1. The Query Agent tools produce citations with the same structure as the prototype
 * 2. All required citation fields are preserved
 * 3. Citation data matches between AgentCore and prototype implementations
 * 
 * Validates: Requirements 3.4, 9.3
 */

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 4: Citation Preservation', () => {
  // Generator for episode IDs (non-empty, non-whitespace)
  const episodeIdArbitrary = fc.oneof(
    fc.constantFrom('onikakushi', 'watanagashi', 'tatarigoroshi', 'himatsubushi'),
    fc.string({ minLength: 5, maxLength: 15 })
      .map((s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase())
      .filter((s) => s.length >= 5), // Ensure non-empty after filtering
  );

  // Generator for non-empty, non-whitespace strings
  const nonEmptyStringArbitrary = (minLength: number, maxLength: number) =>
    fc.string({ minLength, maxLength })
      .filter((s) => s.trim().length >= minLength);

  // Generator for script embeddings
  const scriptEmbeddingArbitrary = fc.record({
    id: fc.uuid(),
    episodeId: episodeIdArbitrary,
    chapterId: nonEmptyStringArbitrary(1, 20),
    messageId: fc.integer({ min: 1, max: 10000 }),
    speaker: fc.option(nonEmptyStringArbitrary(1, 30), { nil: undefined }),
    textENG: nonEmptyStringArbitrary(10, 200),
    textJPN: fc.option(nonEmptyStringArbitrary(10, 200), { nil: undefined }),
    embedding: fc.array(fc.float({ min: -1, max: 1 }), { minLength: 1536, maxLength: 1536 }),
    metadata: fc.record({
      episodeName: nonEmptyStringArbitrary(5, 30),
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

  it('should produce citations with identical structure between AgentCore and prototype', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          // Get results from prototype implementation (semanticSearch)
          const prototypeResults = await semanticSearch(query, {
            topK: 10,
            minScore: 0.0,
          });

          // Get results from AgentCore tool implementation
          const agentCoreInput: SearchKnowledgeBaseInput = {
            query,
            topK: 10,
            minScore: 0.0,
          };
          const agentCoreResults = await searchKnowledgeBase(agentCoreInput);

          // Both should return the same number of results
          expect(agentCoreResults.length).toBe(prototypeResults.length);

          // Compare each result
          for (let i = 0; i < prototypeResults.length; i++) {
            const prototypeResult = prototypeResults[i];
            const agentCoreResult = agentCoreResults[i];

            // All citation fields should match
            expect(agentCoreResult.episodeId).toBe(prototypeResult.episodeId);
            expect(agentCoreResult.episodeName).toBe(prototypeResult.episodeName);
            expect(agentCoreResult.chapterId).toBe(prototypeResult.chapterId);
            expect(agentCoreResult.messageId).toBe(prototypeResult.messageId);
            expect(agentCoreResult.speaker).toBe(prototypeResult.speaker);
            expect(agentCoreResult.textENG).toBe(prototypeResult.textENG);
            expect(agentCoreResult.textJPN).toBe(prototypeResult.textJPN);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve all citation fields when formatting', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptEmbeddingArbitrary,
        async (embedding) => {
          // Create a citation input from the embedding
          const citationInput: FormatCitationInput = {
            episodeId: embedding.episodeId,
            episodeName: embedding.metadata.episodeName,
            chapterId: embedding.chapterId,
            messageId: embedding.messageId,
            speaker: embedding.speaker,
            textENG: embedding.textENG,
            textJPN: embedding.textJPN,
          };

          // Format the citation using the AgentCore tool
          const formattedCitation = await formatCitation(citationInput);

          // All fields should be preserved
          expect(formattedCitation.episodeId).toBe(embedding.episodeId);
          expect(formattedCitation.episodeName).toBe(embedding.metadata.episodeName);
          expect(formattedCitation.chapterId).toBe(embedding.chapterId);
          expect(formattedCitation.messageId).toBe(embedding.messageId);
          expect(formattedCitation.speaker).toBe(embedding.speaker);
          expect(formattedCitation.textENG).toBe(embedding.textENG);
          expect(formattedCitation.textJPN).toBe(embedding.textJPN);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should maintain citation structure compatibility with existing Citation type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          // Get results from AgentCore tool
          const agentCoreResults = await searchKnowledgeBase({
            query,
            topK: 10,
            minScore: 0.0,
          });

          // Each result should be compatible with Citation type
          for (const result of agentCoreResults) {
            const citation: Citation = {
              episodeId: result.episodeId,
              episodeName: result.episodeName,
              chapterId: result.chapterId,
              messageId: result.messageId,
              speaker: result.speaker,
              textENG: result.textENG,
              textJPN: result.textJPN,
            };

            // Verify all required fields are present
            expect(citation.episodeId).toBeDefined();
            expect(citation.episodeName).toBeDefined();
            expect(citation.chapterId).toBeDefined();
            expect(citation.messageId).toBeDefined();
            expect(citation.textENG).toBeDefined();
            expect(typeof citation.episodeId).toBe('string');
            expect(typeof citation.episodeName).toBe('string');
            expect(typeof citation.chapterId).toBe('string');
            expect(typeof citation.messageId).toBe('number');
            expect(typeof citation.textENG).toBe('string');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve episode boundary enforcement between implementations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 10, maxLength: 30 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.array(episodeIdArbitrary, { minLength: 1, maxLength: 3 }),
        async (embeddings, query, episodeFilter) => {
          setupMocks(embeddings);

          // Get results from prototype with episode filter
          const prototypeResults = await semanticSearch(query, {
            episodeIds: episodeFilter,
            topK: 20,
            minScore: 0.0,
          });

          // Get results from AgentCore tool with same filter
          const agentCoreResults = await searchKnowledgeBase({
            query,
            episodeIds: episodeFilter,
            topK: 20,
            minScore: 0.0,
          });

          // Both should respect episode boundaries
          for (const result of prototypeResults) {
            expect(episodeFilter).toContain(result.episodeId);
          }

          for (const result of agentCoreResults) {
            expect(episodeFilter).toContain(result.episodeId);
          }

          // Both should return the same episodes
          const prototypeEpisodes = new Set(prototypeResults.map((r) => r.episodeId));
          const agentCoreEpisodes = new Set(agentCoreResults.map((r) => r.episodeId));

          expect(agentCoreEpisodes).toEqual(prototypeEpisodes);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should format citations with complete metadata matching prototype', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scriptEmbeddingArbitrary, { minLength: 5, maxLength: 15 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (embeddings, query) => {
          setupMocks(embeddings);

          // Get results from both implementations
          const prototypeResults = await semanticSearch(query, {
            topK: 10,
            minScore: 0.0,
          });

          const agentCoreResults = await searchKnowledgeBase({
            query,
            topK: 10,
            minScore: 0.0,
          });

          // Format citations from both
          const prototypeCitations: Citation[] = prototypeResults.map((r) => ({
            episodeId: r.episodeId,
            episodeName: r.episodeName,
            chapterId: r.chapterId,
            messageId: r.messageId,
            speaker: r.speaker,
            textENG: r.textENG,
            textJPN: r.textJPN,
          }));

          const agentCoreCitations: Citation[] = [];
          for (const result of agentCoreResults) {
            const formatted = await formatCitation({
              episodeId: result.episodeId,
              episodeName: result.episodeName,
              chapterId: result.chapterId,
              messageId: result.messageId,
              speaker: result.speaker,
              textENG: result.textENG,
              textJPN: result.textJPN,
            });
            agentCoreCitations.push(formatted);
          }

          // Citations should match
          expect(agentCoreCitations.length).toBe(prototypeCitations.length);

          for (let i = 0; i < prototypeCitations.length; i++) {
            expect(agentCoreCitations[i]).toEqual(prototypeCitations[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject incomplete citations in format_citation tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          episodeId: fc.option(fc.string(), { nil: undefined }),
          episodeName: fc.option(fc.string(), { nil: undefined }),
          chapterId: fc.option(fc.string(), { nil: undefined }),
          messageId: fc.option(fc.integer(), { nil: undefined }),
          textENG: fc.option(fc.string(), { nil: undefined }),
        }),
        async (incompleteCitation) => {
          // Skip if all required fields are present
          if (
            incompleteCitation.episodeId &&
            incompleteCitation.episodeName &&
            incompleteCitation.chapterId &&
            incompleteCitation.messageId !== undefined &&
            incompleteCitation.textENG
          ) {
            return;
          }

          // Should throw error for incomplete citation
          await expect(
            formatCitation(incompleteCitation as any)
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
