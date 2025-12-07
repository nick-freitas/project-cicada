import {
  generateEmbedding,
  storeEmbedding,
  semanticSearch,
  groupResultsByEpisode,
  ScriptEmbedding,
} from '../../src/services/knowledge-base-service';

describe('Knowledge Base Service Integration Tests', () => {
  // Skip AWS-dependent tests in CI/CD - these require AWS credentials and deployed infrastructure
  const skipAWSTests = !process.env.AWS_REGION || process.env.CI === 'true';

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
});
