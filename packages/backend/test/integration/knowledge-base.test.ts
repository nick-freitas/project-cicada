import {
  generateEmbedding,
  storeEmbedding,
  semanticSearch,
  groupResultsByEpisode,
  ScriptEmbedding,
} from '../../src/services/knowledge-base-service';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { getAgentConfig } from '../../src/utils/agentcore-client';

describe('Knowledge Base Service Integration Tests', () => {
  // Skip AWS-dependent tests in CI/CD - these require AWS credentials and deployed infrastructure
  const skipAWSTests = !process.env.AWS_REGION || process.env.CI === 'true' || process.env.SKIP_INTEGRATION_TESTS === 'true';

  describe('generateEmbedding', () => {
    it.skip('should generate embedding for text', async () => {
      // This test requires AWS credentials and Bedrock access
      // Run manually with: AWS_REGION=us-east-1 npm test -- knowledge-base.test.ts
      const text = 'This is a test message from Higurashi';
      const embedding = await generateEmbedding(text);

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536); // Titan embedding dimension
      expect(embedding.every(n => typeof n === 'number')).toBe(true);
    }, 30000); // 30 second timeout for API call
  });

  describe('semanticSearch', () => {
    it.skip('should perform semantic search with episode filter', async () => {
      // This test requires AWS credentials, Bedrock access, and data in S3
      // Run manually after deploying infrastructure and ingesting data
      const results = await semanticSearch('test query', {
        episodeIds: ['onikakushi'],
        topK: 5,
        minScore: 0.5,
      });

      expect(Array.isArray(results)).toBe(true);
    }, 30000);

    it.skip('should apply metadata filters', async () => {
      // This test requires AWS credentials, Bedrock access, and data in S3
      // Run manually after deploying infrastructure and ingesting data
      const results = await semanticSearch('test query', {
        topK: 5,
        metadataFilters: {
          speaker: 'Rena',
        },
      });

      expect(Array.isArray(results)).toBe(true);
      // All results should have speaker === 'Rena' if any results exist
      if (results.length > 0) {
        results.forEach(result => {
          expect(result.metadata.speaker).toBe('Rena');
        });
      }
    }, 30000);
  });

  describe('groupResultsByEpisode', () => {
    it('should group results by episode', () => {
      const results = [
        {
          id: '1',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'chapter1',
          messageId: 1,
          textENG: 'Test 1',
          score: 0.9,
          metadata: {},
        },
        {
          id: '2',
          episodeId: 'onikakushi',
          episodeName: 'Onikakushi',
          chapterId: 'chapter2',
          messageId: 2,
          textENG: 'Test 2',
          score: 0.8,
          metadata: {},
        },
        {
          id: '3',
          episodeId: 'watanagashi',
          episodeName: 'Watanagashi',
          chapterId: 'chapter1',
          messageId: 1,
          textENG: 'Test 3',
          score: 0.7,
          metadata: {},
        },
      ];

      const grouped = groupResultsByEpisode(results);

      expect(grouped.size).toBe(2);
      expect(grouped.get('onikakushi')?.length).toBe(2);
      expect(grouped.get('watanagashi')?.length).toBe(1);
    });
  });

  describe('Knowledge Base Integration with Query Agent', () => {
    it.skip('should invoke Query Agent for semantic search', async () => {
      if (skipAWSTests || !process.env.QUERY_AGENT_ID) {
        console.log('Skipping - Query Agent not deployed');
        return;
      }

      const agentRuntimeClient = new BedrockAgentRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      const queryConfig = getAgentConfig('query');
      const sessionId = `test-kb-session-${Date.now()}`;
      const testQuery = 'What does Rena say about taking things home?';

      const command = new InvokeAgentCommand({
        agentId: queryConfig.agentId,
        agentAliasId: queryConfig.agentAliasId,
        sessionId,
        inputText: testQuery,
        enableTrace: false,
      });

      const response = await agentRuntimeClient.send(command);

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      // Collect response
      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      // Query Agent should return citations from Knowledge Base
      expect(fullResponse.length).toBeGreaterThan(0);
    }, 90000);

    it.skip('should respect episode boundaries in Knowledge Base queries', async () => {
      if (skipAWSTests || !process.env.QUERY_AGENT_ID) {
        console.log('Skipping - Query Agent not deployed');
        return;
      }

      const agentRuntimeClient = new BedrockAgentRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      const queryConfig = getAgentConfig('query');
      const sessionId = `test-kb-session-${Date.now()}`;
      
      // Query with episode context should only return results from that episode
      const testQuery = 'Tell me about the festival in Onikakushi';

      const command = new InvokeAgentCommand({
        agentId: queryConfig.agentId,
        agentAliasId: queryConfig.agentAliasId,
        sessionId,
        inputText: testQuery,
        enableTrace: true, // Enable trace to see Knowledge Base queries
      });

      const response = await agentRuntimeClient.send(command);

      expect(response).toBeDefined();
      expect(response.completion).toBeDefined();

      let fullResponse = '';
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const text = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += text;
          }
        }
      }

      expect(fullResponse.length).toBeGreaterThan(0);
      // Response should reference Onikakushi episode
    }, 90000);
  });
});
