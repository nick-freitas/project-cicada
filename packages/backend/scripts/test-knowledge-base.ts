#!/usr/bin/env ts-node
/**
 * Manual test script for Knowledge Base functionality
 * 
 * Prerequisites:
 * 1. Deploy infrastructure: cd infrastructure && npm run deploy
 * 2. Set environment variables:
 *    - KNOWLEDGE_BASE_BUCKET
 *    - AWS_REGION
 * 3. Ingest some test data
 * 
 * Usage:
 *   AWS_REGION=us-east-1 KNOWLEDGE_BASE_BUCKET=your-bucket ts-node scripts/test-knowledge-base.ts
 */

import {
  generateEmbedding,
  storeEmbedding,
  semanticSearch,
  groupResultsByEpisode,
} from '../src/services/knowledge-base-service';

async function testEmbeddingGeneration() {
  console.log('\n=== Testing Embedding Generation ===');
  
  const testText = 'Rena smiled mysteriously and mentioned Oyashiro-sama.';
  console.log(`Generating embedding for: "${testText}"`);
  
  try {
    const embedding = await generateEmbedding(testText);
    console.log(`✓ Generated embedding with ${embedding.length} dimensions`);
    console.log(`  First 5 values: [${embedding.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`);
    return true;
  } catch (error) {
    console.error('✗ Failed to generate embedding:', error);
    return false;
  }
}

async function testEmbeddingStorage() {
  console.log('\n=== Testing Embedding Storage ===');
  
  const testEmbedding = {
    id: 'test-onikakushi-chapter1-999',
    episodeId: 'onikakushi',
    chapterId: 'test_chapter',
    messageId: 999,
    speaker: 'Test Speaker',
    textENG: 'This is a test message.',
    textJPN: 'これはテストメッセージです。',
    embedding: Array(1536).fill(0).map(() => Math.random()),
    metadata: {
      episodeName: 'Onikakushi',
      type: 'MSGSET',
      speaker: 'Test Speaker',
    },
  };
  
  try {
    await storeEmbedding(testEmbedding);
    console.log(`✓ Stored test embedding: ${testEmbedding.id}`);
    return true;
  } catch (error) {
    console.error('✗ Failed to store embedding:', error);
    return false;
  }
}

async function testSemanticSearch() {
  console.log('\n=== Testing Semantic Search ===');
  
  const queries = [
    {
      query: 'What did Rena say about the curse?',
      options: { topK: 5, minScore: 0.6 },
    },
    {
      query: 'festival events',
      options: { episodeIds: ['onikakushi'], topK: 3 },
    },
    {
      query: 'mysterious disappearances',
      options: { metadataFilters: { speaker: 'Keiichi' }, topK: 5 },
    },
  ];
  
  for (const { query, options } of queries) {
    console.log(`\nQuery: "${query}"`);
    console.log(`Options:`, JSON.stringify(options, null, 2));
    
    try {
      const results = await semanticSearch(query, options);
      console.log(`✓ Found ${results.length} results`);
      
      if (results.length > 0) {
        console.log('\nTop result:');
        const top = results[0];
        console.log(`  Episode: ${top.episodeName} (${top.episodeId})`);
        console.log(`  Chapter: ${top.chapterId}`);
        console.log(`  Speaker: ${top.speaker || 'narrator'}`);
        console.log(`  Score: ${top.score.toFixed(4)}`);
        console.log(`  Text: ${top.textENG.substring(0, 100)}...`);
        
        // Test grouping
        const grouped = groupResultsByEpisode(results);
        console.log(`\nResults grouped into ${grouped.size} episode(s):`);
        for (const [episodeId, episodeResults] of grouped) {
          console.log(`  - ${episodeId}: ${episodeResults.length} results`);
        }
      } else {
        console.log('  (No results found - may need to ingest data first)');
      }
    } catch (error) {
      console.error('✗ Search failed:', error);
      return false;
    }
  }
  
  return true;
}

async function testMetadataFilters() {
  console.log('\n=== Testing Metadata Filters ===');
  
  const filters = [
    { episodeId: 'onikakushi' },
    { speaker: 'Rena' },
    { chapterId: 'kageboushi_11' },
  ];
  
  for (const filter of filters) {
    console.log(`\nFilter:`, JSON.stringify(filter));
    
    try {
      const results = await semanticSearch('test query', {
        metadataFilters: filter,
        topK: 5,
        minScore: 0.5,
      });
      
      console.log(`✓ Found ${results.length} results matching filter`);
      
      // Verify filter was applied
      if (results.length > 0) {
        const filterKey = Object.keys(filter)[0];
        const filterValue = filter[filterKey as keyof typeof filter];
        const allMatch = results.every(r => {
          const value = filterKey === 'episodeId' ? r.episodeId :
                       filterKey === 'chapterId' ? r.chapterId :
                       filterKey === 'speaker' ? r.speaker :
                       r.metadata[filterKey];
          return value === filterValue;
        });
        
        if (allMatch) {
          console.log(`  ✓ All results match filter`);
        } else {
          console.log(`  ✗ Some results don't match filter`);
        }
      }
    } catch (error) {
      console.error('✗ Filter test failed:', error);
      return false;
    }
  }
  
  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Knowledge Base Manual Test Suite');
  console.log('='.repeat(60));
  
  // Check environment
  const bucket = process.env.KNOWLEDGE_BASE_BUCKET;
  const region = process.env.AWS_REGION;
  
  if (!bucket) {
    console.error('\n✗ KNOWLEDGE_BASE_BUCKET environment variable not set');
    process.exit(1);
  }
  
  console.log(`\nConfiguration:`);
  console.log(`  Bucket: ${bucket}`);
  console.log(`  Region: ${region || 'default'}`);
  
  // Run tests
  const results = {
    embeddingGeneration: await testEmbeddingGeneration(),
    embeddingStorage: await testEmbeddingStorage(),
    semanticSearch: await testSemanticSearch(),
    metadataFilters: await testMetadataFilters(),
  };
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  for (const [test, result] of Object.entries(results)) {
    console.log(`${result ? '✓' : '✗'} ${test}`);
  }
  
  console.log(`\n${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n✓ All tests passed! Knowledge Base is working correctly.');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed. Check the output above for details.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n✗ Fatal error:', error);
  process.exit(1);
});
