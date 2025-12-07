import * as fc from 'fast-check';
import { ScriptIngestionService, ProcessedScriptData } from '../../src/services/script-ingestion';
import { ScriptMessage } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 3: Embedding Generation Completeness
 * 
 * For any stored script message, an embedding SHALL be generated and 
 * associated with that message.
 * 
 * Validates: Requirements 1.3
 */

// Mock storage for S3 and Bedrock
const mockS3Storage = new Map<string, string>();
const mockBedrockCalls = new Map<string, number[]>();

// Mock AWS SDK for S3
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation(async (command: any) => {
        // Handle PutObjectCommand
        if (command.input && command.input.Body) {
          mockS3Storage.set(command.input.Key, command.input.Body);
          return {};
        }
        // Handle GetObjectCommand
        if (command.input && command.input.Key) {
          const body = mockS3Storage.get(command.input.Key);
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

// Mock AWS SDK for Bedrock
jest.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation(async (command: any) => {
        // Parse the input text from the command
        const body = JSON.parse(command.input.body);
        const inputText = body.inputText;
        
        // Generate a deterministic embedding based on text
        // For testing, we'll create a simple embedding
        const embedding = Array.from({ length: 1536 }, (_, i) => 
          Math.sin(i + inputText.length) * 0.1
        );
        
        // Track that we generated an embedding for this text
        mockBedrockCalls.set(inputText, embedding);
        
        // Return mock response
        const responseBody = JSON.stringify({ embedding });
        return {
          body: new TextEncoder().encode(responseBody),
        };
      }),
    })),
    InvokeModelCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  };
});

describe('Property 3: Embedding Generation Completeness', () => {
  const service = new ScriptIngestionService();

  beforeEach(() => {
    mockS3Storage.clear();
    mockBedrockCalls.clear();
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
  const processedDataArbitrary = fc
    .tuple(
      fc.string({ minLength: 1 }), // episodeId
      fc.string({ minLength: 1 }), // chapterId
      fc.array(scriptMessageArbitrary, { minLength: 1, maxLength: 10 }) // messages
    )
    .map(([episodeId, chapterId, messages]) => ({
      episodeId,
      chapterId,
      messages: messages.map((msg, index) => ({
        ...msg,
        MessageID: index, // Ensure unique MessageIDs
        episodeId,
        chapterId,
      })),
    })) as fc.Arbitrary<ProcessedScriptData>;

  it('should generate an embedding for every message', async () => {
    await fc.assert(
      fc.asyncProperty(processedDataArbitrary, async (data) => {
        // Clear mocks before each property test run
        mockBedrockCalls.clear();
        mockS3Storage.clear();
        
        // Act: Index the data in Knowledge Base (which generates embeddings)
        await service.indexInKnowledgeBase(data);

        // Assert: An embedding should be generated for each message
        expect(mockBedrockCalls.size).toBe(data.messages.length);

        // Assert: Each message should have had an embedding generated
        for (const message of data.messages) {
          const textForEmbedding = `${message.TextENG}\n${message.TextJPN}`;
          expect(mockBedrockCalls.has(textForEmbedding)).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('should store each message with its embedding in KB bucket', async () => {
    await fc.assert(
      fc.asyncProperty(processedDataArbitrary, async (data) => {
        // Clear mocks before each property test run
        mockBedrockCalls.clear();
        mockS3Storage.clear();
        
        // Act: Index the data
        await service.indexInKnowledgeBase(data);

        // Assert: Each message should be stored in KB bucket
        for (const message of data.messages) {
          const kbKey = `kb/${data.episodeId}/${data.chapterId}/${message.MessageID}.json`;
          expect(mockS3Storage.has(kbKey)).toBe(true);

          // Parse the stored data
          const storedData = JSON.parse(mockS3Storage.get(kbKey)!);

          // Assert: Stored data should include the message and embedding
          expect(storedData.type).toBe(message.type);
          expect(storedData.MessageID).toBe(message.MessageID);
          expect(storedData.TextJPN).toBe(message.TextJPN);
          expect(storedData.TextENG).toBe(message.TextENG);
          expect(storedData.episodeId).toBe(message.episodeId);
          expect(storedData.chapterId).toBe(message.chapterId);
          expect(Array.isArray(storedData.embedding)).toBe(true);
          expect(storedData.embedding.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('should generate embeddings for all messages even with duplicates', async () => {
    await fc.assert(
      fc.asyncProperty(
        processedDataArbitrary,
        async (data) => {
          // Clear mocks before each property test run
          mockBedrockCalls.clear();
          mockS3Storage.clear();
          
          // Create data with some duplicate text
          const messagesWithDuplicates = [
            ...data.messages,
            // Add a duplicate of the first message with different MessageID
            {
              ...data.messages[0],
              MessageID: data.messages[0].MessageID + 1000,
            },
          ];

          const processedData: ProcessedScriptData = {
            ...data,
            messages: messagesWithDuplicates,
          };

          // Act: Index the data
          await service.indexInKnowledgeBase(processedData);

          // Assert: All messages should be stored (including duplicates)
          for (const message of messagesWithDuplicates) {
            const kbKey = `kb/${data.episodeId}/${data.chapterId}/${message.MessageID}.json`;
            expect(mockS3Storage.has(kbKey)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should associate embeddings with correct message metadata', async () => {
    await fc.assert(
      fc.asyncProperty(processedDataArbitrary, async (data) => {
        // Clear mocks before each property test run
        mockBedrockCalls.clear();
        mockS3Storage.clear();
        
        // Act: Index the data
        await service.indexInKnowledgeBase(data);

        // Assert: Each stored message should have correct metadata
        for (const message of data.messages) {
          const kbKey = `kb/${data.episodeId}/${data.chapterId}/${message.MessageID}.json`;
          const storedData = JSON.parse(mockS3Storage.get(kbKey)!);

          // Assert: Embedding is associated with correct message
          expect(storedData.MessageID).toBe(message.MessageID);
          expect(storedData.episodeId).toBe(data.episodeId);
          expect(storedData.chapterId).toBe(data.chapterId);
          
          // Assert: The text used for embedding matches the message
          const expectedText = `${message.TextENG}\n${message.TextJPN}`;
          expect(storedData.textForEmbedding).toBe(expectedText);
        }
      }),
      { numRuns: 50 }
    );
  });
});
