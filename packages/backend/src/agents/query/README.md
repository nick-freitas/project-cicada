# Query Agent

The Query Agent is a specialized AgentCore agent for script search and citation. It provides deterministic, reliable semantic search over the Higurashi script database.

## Features

- **Deterministic Search**: ALWAYS invokes semantic search for every query - no autonomous decision making
- **Complete Citations**: Formats results with episode name, chapter ID, message ID, speaker, and text
- **Honest Responses**: Explicitly states when no results are found - never hallucinates
- **Episode Boundaries**: Maintains separation between different story arcs
- **User Isolation**: All operations scoped to user identity

## Architecture

```
User Query
    │
    ▼
Query Agent
    │
    ├─ ALWAYS invoke SemanticSearchTool (deterministic)
    ├─ Format search results with citations
    ├─ Build context with conversation history
    └─ Invoke LLM with formatted context
    │
    ▼
Response with Citations
```

## Components

### QueryAgent

Main agent class that orchestrates script search and response generation.

**Key Methods:**
- `invokeAgent(params)`: Main entry point for query processing
- `formatSearchResults(results)`: Formats search results with complete citations

**Configuration:**
- Model: `amazon.nova-pro-v1:0`
- Max Tokens: 2048
- Temperature: 0.7

### SemanticSearchTool

Tool for performing semantic search over the script database.

**Input Schema:**
```typescript
{
  query: string;              // Search query (required)
  topK?: number;              // Number of results (default: 20)
  minScore?: number;          // Minimum similarity score (default: 0.5)
  maxEmbeddingsToLoad?: number; // Max embeddings to load (default: 3000)
  episodeIds?: string[];      // Optional episode filter
}
```

**Output:**
```typescript
{
  results: SearchResult[];    // Array of search results
  resultCount: number;        // Total number of results
  query: string;              // Original query
}
```

## Usage

```typescript
import { QueryAgent } from './agents/query';

const agent = new QueryAgent();

const result = await agent.invokeAgent({
  query: 'Who is Rena?',
  identity: {
    userId: 'user-123',
    username: 'john',
  },
  memory: {
    userId: 'user-123',
    sessionId: 'session-456',
    messages: [],
    lastAccessed: new Date(),
  },
});

console.log(result.content); // Response with citations
console.log(result.metadata); // Processing metadata
```

## Requirements Validation

This implementation satisfies the following requirements:

- **2.1**: Query Agent explicitly invokes semantic search tool ✓
- **2.2**: Search tool always executes (deterministic behavior) ✓
- **2.3**: Results formatted with complete citations ✓
- **2.4**: Honest "no results" message when appropriate ✓
- **2.5**: Responses based strictly on search results ✓

## Testing

Unit tests are located in `__tests__/query-agent.test.ts`.

Run tests:
```bash
pnpm test -- query-agent.test.ts --run
```

**Test Coverage:**
- Agent configuration
- Deterministic search invocation
- Citation formatting
- Empty results handling
- Error handling
- Metadata validation

## System Prompt

The Query Agent uses the following system prompt:

```
You are CICADA's Query Agent, specialized in analyzing Higurashi script content.

Your responsibilities:
1. Base responses STRICTLY on provided script passages
2. Cite specific episodes, chapters, and speakers
3. If no passages are found, state so honestly - never hallucinate
4. Maintain episode boundaries - don't mix information from different arcs
5. Be conversational but accurate

Always ground your responses in the script evidence provided.
```

## Error Handling

The Query Agent handles errors gracefully:

- **Search Tool Errors**: Returns user-friendly error message
- **Invalid Identity**: Validates user identity before processing
- **Empty Results**: Explicitly states no information was found
- **Tool Execution Failures**: Logs error and returns appropriate message

## Logging

All agent activity is logged for debugging and monitoring:

- Agent invocation start/complete
- Search tool execution
- Result counts and scores
- Processing times
- Errors and warnings

## Next Steps

The Query Agent is now ready to be integrated with:

1. **Orchestrator Agent**: For routing queries to the Query Agent
2. **Theory Agent**: For evidence gathering via Query Agent invocation
3. **Gateway**: For handling user requests and streaming responses

## Related Files

- `query-agent.ts`: Main agent implementation
- `semantic-search-tool.ts`: Search tool implementation
- `__tests__/query-agent.test.ts`: Unit tests
- `../../services/knowledge-base-service.ts`: Semantic search service
- `../../types/agentcore.ts`: Type definitions
