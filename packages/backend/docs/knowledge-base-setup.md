# Bedrock Knowledge Base Setup

## Overview

The CICADA Knowledge Base provides semantic search over Higurashi script data using Amazon Bedrock Titan Embeddings. The implementation uses a cost-effective approach with S3-stored embeddings and Lambda-based vector search to stay within the $100/month budget.

## Architecture

### Components

1. **S3 Buckets**
   - `ScriptDataBucket`: Stores raw and processed script JSON files
   - `KnowledgeBaseBucket`: Stores embeddings and indexed data

2. **Embedding Model**
   - Amazon Titan Embed Text v1 (1536 dimensions)
   - Accessed via Bedrock Runtime API

3. **Vector Search**
   - Cosine similarity calculation in Lambda
   - Metadata filtering (episodeId, chapterId, messageId, speaker)
   - Episode boundary enforcement

### Storage Structure

```
KnowledgeBaseBucket/
└── embeddings/
    └── {episodeId}/
        └── {chapterId}/
            └── {id}.json
```

Each embedding file contains:
```json
{
  "id": "onikakushi-chapter1-1",
  "episodeId": "onikakushi",
  "chapterId": "chapter1",
  "messageId": 1,
  "speaker": "Keiichi",
  "textENG": "English text...",
  "textJPN": "Japanese text...",
  "embedding": [0.123, 0.456, ...],
  "metadata": {
    "episodeName": "Onikakushi",
    "type": "MSGSET",
    "speaker": "Keiichi"
  }
}
```

## Features

### 1. Semantic Search

Search across script data using natural language queries:

```typescript
import { semanticSearch } from './services/knowledge-base-service';

const results = await semanticSearch('What did Rena say about Oyashiro-sama?', {
  topK: 10,
  minScore: 0.7,
});
```

### 2. Episode Boundary Enforcement

Limit search to specific episodes to prevent mixing contradictory information:

```typescript
const results = await semanticSearch('What happened at the festival?', {
  episodeIds: ['onikakushi', 'watanagashi'],
  topK: 10,
});
```

### 3. Metadata Filtering

Filter results by speaker, chapter, or other metadata:

```typescript
const results = await semanticSearch('dialogue about the curse', {
  metadataFilters: {
    speaker: 'Rena',
  },
  topK: 10,
});
```

### 4. Result Grouping

Group search results by episode to maintain narrative coherence:

```typescript
import { groupResultsByEpisode } from './services/knowledge-base-service';

const results = await semanticSearch('mystery clues');
const grouped = groupResultsByEpisode(results);

for (const [episodeId, episodeResults] of grouped) {
  console.log(`Episode: ${episodeId}`);
  episodeResults.forEach(result => {
    console.log(`  - ${result.textENG}`);
  });
}
```

## Data Ingestion

The script ingestion pipeline automatically:

1. Parses JSON script files
2. Associates chapters with episodes using configuration
3. Generates embeddings for each message
4. Stores embeddings in S3 with metadata

```typescript
import { scriptIngestionService } from './services/script-ingestion';

await scriptIngestionService.processScriptFile(
  'kageboushi_11.json',
  jsonContent
);
```

## Cost Optimization

This implementation avoids expensive managed vector databases:

- **No OpenSearch Serverless**: Saves ~$50-100/month
- **No RDS Aurora Serverless**: Saves ~$30-50/month
- **S3 Storage**: ~$0.023/GB/month
- **Bedrock Embeddings**: ~$0.0001 per 1000 tokens
- **Lambda Compute**: Pay per invocation

**Estimated Monthly Cost**: $5-15 for typical usage (3 users, 100 queries/month)

## Metadata Filters

The Knowledge Base supports the following metadata filters as specified in Requirements 3.1-3.5:

- `episodeId`: Filter by episode (e.g., "onikakushi")
- `chapterId`: Filter by chapter (e.g., "kageboushi_11")
- `messageId`: Filter by specific message ID
- `speaker`: Filter by character name (e.g., "Rena", "Keiichi")

## Testing

Run integration tests:

```bash
cd packages/backend
npm test -- knowledge-base.test.ts
```

Note: Integration tests require AWS credentials and will make actual API calls to Bedrock.

## Environment Variables

Required environment variables:

- `KNOWLEDGE_BASE_BUCKET`: S3 bucket name for embeddings
- `SCRIPT_BUCKET_NAME`: S3 bucket name for script data
- `AWS_REGION`: AWS region (default: us-east-1)

## Future Enhancements

1. **Caching**: Cache frequent queries to reduce Bedrock API calls
2. **Batch Processing**: Process multiple embeddings in parallel
3. **Incremental Updates**: Only re-index changed chapters
4. **Vector Index**: Add FAISS or similar for faster search at scale
