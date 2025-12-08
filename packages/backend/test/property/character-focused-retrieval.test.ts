import * as fc from 'fast-check';
// TODO: Update this test to work with AgentCore implementation
// The old prototype agents have been removed - this test needs to be updated
// to test the AgentCore-based Query Agent through the handler tools
// import { QueryAgent } from '../../src/agents/query-agent';
import { SearchResult } from '../../src/services/knowledge-base-service';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Feature: project-cicada, Property 19: Character-Focused Retrieval
 * 
 * For any query about a specific character, all retrieved passages 
 * SHALL feature that character.
 * 
 * Validates: Requirements 11.2
 */

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 19: Character-Focused Retrieval', () => {
  let queryAgent: QueryAgent;

  beforeEach(() => {
    queryAgent = new QueryAgent();
    jest.clearAllMocks();
  });

  // Generator for character names
  const characterNameArbitrary = fc.oneof(
    fc.constantFrom('Rena', 'Mion', 'Shion', 'Satoko', 'Rika', 'Keiichi'),
    fc.string({ minLength: 3, maxLength: 15 }).filter((s) => s.trim().length > 0),
  );

  // Generator for episode IDs
  const episodeIdArbitrary = fc.oneof(
    fc.constantFrom('onikakushi', 'watanagashi', 'tatarigoroshi', 'himatsubushi'),
    fc.string({ minLength: 5, maxLength: 15 }).map((s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()),
  );

  // Generator for search results that feature a specific character
  const searchResultWithCharacterArbitrary = (characterName: string) =>
    fc.record({
      id: fc.uuid(),
      episodeId: episodeIdArbitrary,
      episodeName: fc.string({ minLength: 5, maxLength: 30 }),
      chapterId: fc.string({ minLength: 1, maxLength: 20 }),
      messageId: fc.integer({ min: 1, max: 10000 }),
      speaker: fc.oneof(
        fc.constant(characterName),
        fc.constant(undefined),
        fc.string({ minLength: 1, maxLength: 30 }),
      ),
      textENG: fc.oneof(
        fc.constant(`${characterName} said something important.`),
        fc.constant(`This is about ${characterName} and their actions.`),
        fc.string({ minLength: 10, maxLength: 200 }).map((s) => `${s} ${characterName} ${s}`),
      ),
      textJPN: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
      score: fc.float({ min: Math.fround(0.7), max: Math.fround(1.0) }),
      metadata: fc.record({
        episodeName: fc.string({ minLength: 5, maxLength: 30 }),
      }),
    });

  // Generator for search results that do NOT feature a specific character
  const searchResultWithoutCharacterArbitrary = (characterName: string) =>
    fc.record({
      id: fc.uuid(),
      episodeId: episodeIdArbitrary,
      episodeName: fc.string({ minLength: 5, maxLength: 30 }),
      chapterId: fc.string({ minLength: 1, maxLength: 20 }),
      messageId: fc.integer({ min: 1, max: 10000 }),
      speaker: fc
        .string({ minLength: 1, maxLength: 30 })
        .filter((s) => !s.toLowerCase().includes(characterName.toLowerCase())),
      textENG: fc
        .string({ minLength: 10, maxLength: 200 })
        .filter((s) => !s.toLowerCase().includes(characterName.toLowerCase())),
      textJPN: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
      score: fc.float({ min: Math.fround(0.7), max: Math.fround(1.0) }),
      metadata: fc.record({
        episodeName: fc.string({ minLength: 5, maxLength: 30 }),
      }),
    });

  // Helper to setup mocks
  const setupMocks = (searchResults: SearchResult[], responseText: string = 'Test response') => {
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
        // Response generation
        return Promise.resolve({
          output: {
            message: {
              content: [{ text: responseText }],
            },
          },
        });
      }

      return Promise.resolve({});
    });

    // Mock S3 to return search results as embeddings
    const embeddings = searchResults.map((r) => ({
      ...r,
      embedding: mockQueryEmbedding,
    }));

    (S3Client.prototype.send as jest.Mock) = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'ListObjectsV2Command') {
        return Promise.resolve({
          Contents: embeddings.map((e) => ({
            Key: `embeddings/${e.episodeId}/${e.chapterId}/${e.id}.json`,
          })),
        });
      }

      if (commandName === 'GetObjectCommand') {
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

  it('should only return passages featuring the specified character as speaker', async () => {
    await fc.assert(
      fc.asyncProperty(
        characterNameArbitrary,
        fc.array(fc.nat({ max: 20 }), { minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (characterName, indices, query) => {
          // Generate mix of results with and without the character
          const resultsWithCharacter = await fc.sample(
            searchResultWithCharacterArbitrary(characterName).map((r) => ({
              ...r,
              speaker: characterName,
              textENG: fc.sample(fc.string({ minLength: 10, maxLength: 200 }), 1)[0],
            })),
            5,
          );

          const resultsWithoutCharacter = await fc.sample(
            searchResultWithoutCharacterArbitrary(characterName),
            5,
          );

          const allResults = [...resultsWithCharacter, ...resultsWithoutCharacter];
          setupMocks(allResults);

          const response = await queryAgent.processQuery({
            query,
            userId: 'test-user',
            characterFocus: characterName,
          });

          // Assert: All citations should feature the character
          for (const citation of response.citations) {
            const hasCharacterAsSpeaker =
              citation.speaker?.toLowerCase().includes(characterName.toLowerCase());
            const hasCharacterInText = citation.textENG
              .toLowerCase()
              .includes(characterName.toLowerCase());

            expect(hasCharacterAsSpeaker || hasCharacterInText).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return passages where character is mentioned in text', async () => {
    await fc.assert(
      fc.asyncProperty(
        characterNameArbitrary,
        fc.string({ minLength: 5, maxLength: 50 }),
        async (characterName, query) => {
          // Generate results where character is mentioned in text but not speaker
          const results = await fc.sample(
            searchResultWithCharacterArbitrary(characterName).map((r) => ({
              ...r,
              speaker: undefined,
              textENG: `This passage mentions ${characterName} in the text.`,
            })),
            10,
          );

          setupMocks(results);

          const response = await queryAgent.processQuery({
            query,
            userId: 'test-user',
            characterFocus: characterName,
          });

          // Assert: All citations should mention the character in text
          for (const citation of response.citations) {
            expect(citation.textENG.toLowerCase()).toContain(characterName.toLowerCase());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should filter out passages not featuring the character', async () => {
    await fc.assert(
      fc.asyncProperty(
        characterNameArbitrary,
        fc.string({ minLength: 5, maxLength: 50 }),
        async (characterName, query) => {
          // Generate only results WITHOUT the character
          const results = await fc.sample(searchResultWithoutCharacterArbitrary(characterName), 10);

          setupMocks(results);

          const response = await queryAgent.processQuery({
            query,
            userId: 'test-user',
            characterFocus: characterName,
          });

          // Assert: Should have no citations since none feature the character
          expect(response.citations.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle case-insensitive character matching', async () => {
    await fc.assert(
      fc.asyncProperty(
        characterNameArbitrary,
        fc.string({ minLength: 5, maxLength: 50 }).filter((s) => s.trim().length > 0),
        async (characterName, query) => {
          // Generate results with various casings
          const results = await fc.sample(
            searchResultWithCharacterArbitrary(characterName).map((r) => ({
              ...r,
              speaker: fc.sample(
                fc.constantFrom(
                  characterName.toUpperCase(),
                  characterName.toLowerCase(),
                  characterName,
                ),
                1,
              )[0],
            })),
            10,
          );

          setupMocks(results);

          const response = await queryAgent.processQuery({
            query,
            userId: 'test-user',
            characterFocus: characterName,
          });

          // Assert: If results were found, they should match the character regardless of case
          // Note: It's valid to have 0 results if the semantic search doesn't find matches
          for (const citation of response.citations) {
            const hasCharacter =
              citation.speaker?.toLowerCase().includes(characterName.toLowerCase()) ||
              citation.textENG.toLowerCase().includes(characterName.toLowerCase());
            expect(hasCharacter).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should maintain episode context when filtering by character', async () => {
    await fc.assert(
      fc.asyncProperty(
        characterNameArbitrary,
        fc.array(episodeIdArbitrary, { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (characterName, episodeIds, query) => {
          // Generate results with character in specified episodes
          const results = await fc.sample(
            searchResultWithCharacterArbitrary(characterName).map((r) => ({
              ...r,
              episodeId: fc.sample(fc.constantFrom(...episodeIds), 1)[0],
            })),
            10,
          );

          setupMocks(results);

          const response = await queryAgent.processQuery({
            query,
            userId: 'test-user',
            episodeContext: episodeIds,
            characterFocus: characterName,
          });

          // Assert: All citations should be from specified episodes AND feature character
          for (const citation of response.citations) {
            expect(episodeIds).toContain(citation.episodeId);

            const hasCharacter =
              citation.speaker?.toLowerCase().includes(characterName.toLowerCase()) ||
              citation.textENG.toLowerCase().includes(characterName.toLowerCase());
            expect(hasCharacter).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
