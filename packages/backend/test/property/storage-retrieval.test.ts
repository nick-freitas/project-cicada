import * as fc from 'fast-check';
import { ScriptIngestionService, ProcessedScriptData } from '../../src/services/script-ingestion';
import { ScriptMessage } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 2: Storage-Retrieval Round Trip
 * 
 * For any script data stored in S3, retrieving it SHALL return data 
 * equivalent to what was stored.
 * 
 * Validates: Requirements 1.2
 */

// Mock storage
const mockStorage = new Map<string, string>();

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation(async (command: any) => {
        // Handle PutObjectCommand
        if (command.input && command.input.Body) {
          mockStorage.set(command.input.Key, command.input.Body);
          return {};
        }
        // Handle GetObjectCommand
        if (command.input && command.input.Key) {
          const body = mockStorage.get(command.input.Key);
          if (!body) {
            throw new Error('Not found');
          }
          return {
            Body: {
              transformToString: async () => body,
            },
          };
        }
        return {};
      }),
    })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  };
});

describe('Property 2: Storage-Retrieval Round Trip', () => {
  const service = new ScriptIngestionService();

  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
  });

  // Generator for script messages
  const scriptMessageArbitrary = fc.record({
    type: fc.string({ minLength: 1 }),
    MessageID: fc.integer({ min: 0 }),
    TextJPN: fc.string(),
    TextENG: fc.string(),
    speaker: fc.option(fc.string(), { nil: undefined }),
    episodeId: fc.string({ minLength: 1 }),
    chapterId: fc.string({ minLength: 1 }),
  }) as fc.Arbitrary<ScriptMessage>;

  // Generator for processed script data
  const processedDataArbitrary = fc.record({
    messages: fc.array(scriptMessageArbitrary, { minLength: 1, maxLength: 20 }),
    episodeId: fc.string({ minLength: 1 }),
    chapterId: fc.string({ minLength: 1 }),
  }) as fc.Arbitrary<ProcessedScriptData>;

  it('should retrieve data equivalent to what was stored', async () => {
    await fc.assert(
      fc.asyncProperty(processedDataArbitrary, async (data) => {
        // Act: Store the data
        await service.storeScriptData(data);

        // Act: Retrieve the data
        const retrieved = await service.retrieveScriptData(data.episodeId, data.chapterId);

        // Assert: Retrieved data should match stored data
        expect(retrieved.episodeId).toBe(data.episodeId);
        expect(retrieved.chapterId).toBe(data.chapterId);
        expect(retrieved.messages.length).toBe(data.messages.length);

        // Assert: Each message should match
        for (let i = 0; i < data.messages.length; i++) {
          const original = data.messages[i];
          const retrievedMsg = retrieved.messages[i];

          expect(retrievedMsg.type).toBe(original.type);
          expect(retrievedMsg.MessageID).toBe(original.MessageID);
          expect(retrievedMsg.TextJPN).toBe(original.TextJPN);
          expect(retrievedMsg.TextENG).toBe(original.TextENG);
          expect(retrievedMsg.speaker).toBe(original.speaker);
          expect(retrievedMsg.episodeId).toBe(original.episodeId);
          expect(retrievedMsg.chapterId).toBe(original.chapterId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve exact data structure through round trip', async () => {
    await fc.assert(
      fc.asyncProperty(processedDataArbitrary, async (data) => {
        // Act: Store and retrieve
        await service.storeScriptData(data);
        const retrieved = await service.retrieveScriptData(data.episodeId, data.chapterId);

        // Assert: Deep equality
        expect(retrieved).toEqual(data);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle multiple stores and retrievals independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(processedDataArbitrary, { minLength: 2, maxLength: 5 }),
        async (dataArray) => {
          // Ensure unique episode/chapter combinations
          const uniqueData = dataArray.map((data, index) => ({
            ...data,
            episodeId: `episode-${index}`,
            chapterId: `chapter-${index}`,
            messages: data.messages.map(msg => ({
              ...msg,
              episodeId: `episode-${index}`,
              chapterId: `chapter-${index}`,
            })),
          }));

          // Act: Store all data
          for (const data of uniqueData) {
            await service.storeScriptData(data);
          }

          // Act: Retrieve all data
          for (const data of uniqueData) {
            const retrieved = await service.retrieveScriptData(data.episodeId, data.chapterId);
            
            // Assert: Each retrieval should match its stored data
            expect(retrieved).toEqual(data);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
