/**
 * Tests for Semantic Search Tool
 * 
 * Validates that the tool properly wraps the semantic search service
 * with input validation, error handling, and logging.
 * 
 * Requirements: 6.1, 6.2
 */

import { SemanticSearchTool } from '../semantic-search-tool';
import { ToolExecutionContext } from '../../base';
import * as knowledgeBaseService from '../../../services/knowledge-base-service';

// Mock the Strands SDK
jest.mock('@strands-agents/sdk', () => ({
  Agent: class MockAgent {
    constructor(config: any) {}
    async invoke(input: any) {
      return {
        toString: () => 'Mocked agent response',
        lastMessage: {
          content: [],
        },
        stopReason: 'end_turn',
      };
    }
  },
  tool: jest.fn(),
}));

// Mock the knowledge base service
jest.mock('../../../services/knowledge-base-service');

describe('SemanticSearchTool', () => {
  let tool: SemanticSearchTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tool = new SemanticSearchTool();
    mockContext = {
      userId: 'test-user',
      sessionId: 'test-session',
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('semanticSearch');
    });

    it('should have descriptive description', () => {
      expect(tool.description).toContain('semantic similarity');
      expect(tool.description).toContain('Higurashi');
    });

    it('should have tool definition', () => {
      const definition = tool.getToolDefinition();
      expect(definition.name).toBe('semanticSearch');
      expect(definition.description).toBeTruthy();
      expect(definition.inputSchema).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should accept valid input with all parameters', async () => {
      const mockResults = [
        {
          id: 'test-1',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'onikakushi_01',
          messageId: 100,
          speaker: 'Rena',
          textENG: 'Test text',
          score: 0.95,
          metadata: {},
        },
      ];

      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue(mockResults);

      const result = await tool.execute(
        {
          query: 'Who is Rena?',
          topK: 10,
          minScore: 0.7,
          maxEmbeddingsToLoad: 1000,
          episodeIds: ['onikakushi'],
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.results).toEqual(mockResults);
    });

    it('should accept minimal valid input (query only)', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should reject empty query', async () => {
      const result = await tool.execute(
        {
          query: '',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject invalid topK (negative)', async () => {
      const result = await tool.execute(
        {
          query: 'Test',
          topK: -5,
        },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should reject invalid minScore (out of range)', async () => {
      const result = await tool.execute(
        {
          query: 'Test',
          minScore: 1.5,
        },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('should call semanticSearch service with correct parameters', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          query: 'Who is Rena?',
          topK: 15,
          minScore: 0.6,
          maxEmbeddingsToLoad: 2000,
          episodeIds: ['onikakushi', 'watanagashi'],
        },
        mockContext
      );

      expect(knowledgeBaseService.semanticSearch).toHaveBeenCalledWith('Who is Rena?', {
        topK: 15,
        minScore: 0.6,
        maxEmbeddingsToLoad: 2000,
        episodeIds: ['onikakushi', 'watanagashi'],
      });
    });

    it('should use default values for optional parameters', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(knowledgeBaseService.semanticSearch).toHaveBeenCalledWith('Test query', {
        topK: 20,
        minScore: 0.5,
        maxEmbeddingsToLoad: 3000,
        episodeIds: undefined,
      });
    });

    it('should return search results with metadata', async () => {
      const mockResults = [
        {
          id: 'test-1',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'onikakushi_01',
          messageId: 100,
          speaker: 'Rena',
          textENG: 'Kana? Kana?',
          score: 0.95,
          metadata: { arc: 'question' },
        },
        {
          id: 'test-2',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'onikakushi_02',
          messageId: 200,
          speaker: 'Rena',
          textENG: 'I want to take it home!',
          score: 0.88,
          metadata: { arc: 'question' },
        },
      ];

      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue(mockResults);

      const result = await tool.execute(
        {
          query: 'What does Rena say?',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.results).toEqual(mockResults);
      expect(result.data?.resultCount).toBe(2);
      expect(result.data?.query).toBe('What does Rena say?');
    });

    it('should handle empty results', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute(
        {
          query: 'Nonexistent character',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.results).toEqual([]);
      expect(result.data?.resultCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('S3 connection failed');
      (knowledgeBaseService.semanticSearch as jest.Mock).mockRejectedValue(serviceError);

      const result = await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('S3 connection failed');
    });

    it('should include execution time in error metadata', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockRejectedValue(
        new Error('Test error')
      );

      const result = await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Logging', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should log tool invocation', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('tool_invocation')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('semanticSearch')
      );
    });

    it('should log successful execution', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('tool_success')
      );
    });

    it('should log errors', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockRejectedValue(
        new Error('Test error')
      );

      await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('tool_error')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
    });

    it('should sanitize long queries in logs', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      const longQuery = 'A'.repeat(150);
      await tool.execute(
        {
          query: longQuery,
        },
        mockContext
      );

      const logCall = consoleLogSpy.mock.calls.find((call) =>
        call[0].includes('tool_invocation')
      );
      expect(logCall).toBeDefined();
      
      const logData = JSON.parse(logCall[0]);
      expect(logData.input.query.length).toBeLessThan(longQuery.length);
      expect(logData.input.query).toContain('...');
    });
  });

  describe('Performance Metadata', () => {
    it('should include execution time in successful results', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute(
        {
          query: 'Test query',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata?.executionTime).toBe('number');
    });
  });

  describe('Episode Filtering', () => {
    it('should pass episode IDs to search service', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          query: 'Test query',
          episodeIds: ['onikakushi', 'watanagashi', 'tatarigoroshi'],
        },
        mockContext
      );

      expect(knowledgeBaseService.semanticSearch).toHaveBeenCalledWith(
        'Test query',
        expect.objectContaining({
          episodeIds: ['onikakushi', 'watanagashi', 'tatarigoroshi'],
        })
      );
    });

    it('should handle empty episode IDs array', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          query: 'Test query',
          episodeIds: [],
        },
        mockContext
      );

      expect(knowledgeBaseService.semanticSearch).toHaveBeenCalledWith(
        'Test query',
        expect.objectContaining({
          episodeIds: [],
        })
      );
    });
  });
});
