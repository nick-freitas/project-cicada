/**
 * Unit tests for Query Agent
 * 
 * Tests the deterministic search invocation and citation formatting.
 */

import { QueryAgent } from '../query-agent';
import { SemanticSearchTool } from '../semantic-search-tool';
import { UserIdentity } from '../../types/identity';
import { ConversationMemory } from '../../types/memory';
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

describe('QueryAgent', () => {
  let agent: QueryAgent;
  let mockIdentity: UserIdentity;
  let mockMemory: ConversationMemory;

  beforeEach(() => {
    agent = new QueryAgent();
    
    mockIdentity = {
      userId: 'test-user-123',
      username: 'testuser',
    };

    mockMemory = {
      userId: 'test-user-123',
      sessionId: 'test-session-456',
      messages: [],
      lastAccessed: new Date(),
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Agent Configuration', () => {
    it('should be initialized with correct name and description', () => {
      expect(agent['agentName']).toBe('CICADA-Query');
      expect(agent['agentDescription']).toBe('Script search and citation specialist');
    });

    it('should have semantic search tool initialized', () => {
      expect(agent['searchTool']).toBeInstanceOf(SemanticSearchTool);
    });
  });

  describe('Deterministic Search Invocation', () => {
    it('should always invoke semantic search for any query', async () => {
      // Mock search results
      const mockResults = [
        {
          id: 'msg-1',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'onikakushi_01',
          messageId: 100,
          speaker: 'Rena',
          textENG: 'Test text from Rena',
          score: 0.95,
          metadata: {},
        },
      ];

      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue(mockResults);

      // Spy on the search tool execute method
      const searchSpy = jest.spyOn(agent['searchTool'], 'execute');

      // Invoke agent
      await agent.invokeAgent({
        query: 'Who is Rena?',
        identity: mockIdentity,
        memory: mockMemory,
      });

      // Verify search was invoked exactly once
      expect(searchSpy).toHaveBeenCalledTimes(1);
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Who is Rena?',
          topK: 20,
          minScore: 0.5,
          maxEmbeddingsToLoad: 3000,
        }),
        expect.objectContaining({
          userId: mockIdentity.userId,
          sessionId: mockMemory.sessionId,
        })
      );
    });

    it('should invoke search even for empty results', async () => {
      // Mock empty search results
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      const searchSpy = jest.spyOn(agent['searchTool'], 'execute');

      await agent.invokeAgent({
        query: 'Non-existent query',
        identity: mockIdentity,
        memory: mockMemory,
      });

      // Verify search was still invoked
      expect(searchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Citation Formatting', () => {
    it('should format search results with complete citations', async () => {
      const mockResults = [
        {
          id: 'msg-1',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'onikakushi_01',
          messageId: 100,
          speaker: 'Rena',
          textENG: 'Kana, kana?',
          score: 0.95,
          metadata: {},
        },
        {
          id: 'msg-2',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'onikakushi_02',
          messageId: 200,
          speaker: 'Mion',
          textENG: 'Welcome to Hinamizawa!',
          score: 0.85,
          metadata: {},
        },
      ];

      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue(mockResults);

      // Call the private formatSearchResults method via reflection
      const formattedContext = agent['formatSearchResults'](mockResults);

      // Verify all required citation elements are present
      expect(formattedContext).toContain('Episode: Onikakushi');
      expect(formattedContext).toContain('Chapter: onikakushi_01');
      expect(formattedContext).toContain('Message: 100');
      expect(formattedContext).toContain('Speaker: Rena');
      expect(formattedContext).toContain('Text: Kana, kana?');
      expect(formattedContext).toContain('Relevance: 95.0%');
    });

    it('should handle empty results honestly', async () => {
      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue([]);

      const formattedContext = agent['formatSearchResults']([]);

      // Verify honest "no results" message
      expect(formattedContext).toContain('No relevant passages found');
      expect(formattedContext).not.toContain('Episode:');
    });

    it('should limit formatted results to top 10', async () => {
      // Create 15 mock results
      const mockResults = Array.from({ length: 15 }, (_, i) => ({
        id: `msg-${i}`,
        episodeId: 'onikakushi',
        episodeName: 'Onikakushi',
        chapterId: 'onikakushi_01',
        messageId: i,
        speaker: 'Rena',
        textENG: `Text ${i}`,
        score: 0.9 - i * 0.01,
        metadata: {},
      }));

      (knowledgeBaseService.semanticSearch as jest.Mock).mockResolvedValue(mockResults);

      const formattedContext = agent['formatSearchResults'](mockResults);

      // Count how many results are in the formatted context
      const resultCount = (formattedContext.match(/\[(\d+)\]/g) || []).length;
      expect(resultCount).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle search tool errors gracefully', async () => {
      // Mock search to throw error
      (knowledgeBaseService.semanticSearch as jest.Mock).mockRejectedValue(
        new Error('Search service unavailable')
      );

      const result = await agent.invokeAgent({
        query: 'Test query',
        identity: mockIdentity,
        memory: mockMemory,
      });

      // Verify error is handled and user-friendly message is returned
      expect(result.content).toContain('error');
      expect(result.metadata?.agentsInvoked).toContain('QueryAgent');
    });

    it('should validate identity before processing', async () => {
      const invalidIdentity = {
        userId: '',
        username: '',
      };

      const result = await agent.invokeAgent({
        query: 'Test query',
        identity: invalidIdentity,
        memory: mockMemory,
      });

      // Verify error is returned
      expect(result.content).toContain('error');
    });
  });

  describe('Metadata', () => {
    it('should include correct metadata in response', async () => {
      const mockResults = [
        {
          id: 'msg-1',
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

      const result = await agent.invokeAgent({
        query: 'Test query',
        identity: mockIdentity,
        memory: mockMemory,
      });

      // Verify metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.agentsInvoked).toContain('QueryAgent');
      expect(result.metadata?.toolsUsed).toContain('semanticSearch');
      expect(result.metadata?.processingTime).toBeGreaterThan(0);
    });
  });
});
