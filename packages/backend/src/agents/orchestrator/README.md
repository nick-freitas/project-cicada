# Orchestrator Agent

The Orchestrator Agent is the central coordinator for the CICADA multi-agent system. It uses **deterministic, keyword-based classification** to route queries to specialized agents.

## Key Features

- **Explicit Routing Logic**: No autonomous LLM decisions - all routing is keyword-based
- **Deterministic Classification**: Same query always routes to the same agent
- **Comprehensive Logging**: All routing decisions are logged for debugging
- **Fallback Handling**: Defaults to Query Agent if classification is uncertain
- **Error Recovery**: Attempts fallback to Query Agent on errors

## Architecture

```
User Query
    │
    ▼
Orchestrator Agent
    │
    ├─ Explicit Classification (keyword matching)
    ├─ Deterministic Routing (switch statement)
    │
    ├──► Query Agent (script search)
    ├──► Theory Agent (theory analysis) [TODO]
    └──► Profile Agent (profile management) [TODO]
```

## Query Classification

The Orchestrator uses simple keyword matching to classify queries:

### Profile Requests
Keywords: `show me`, `list`, `my profile`, `update profile`, `save profile`, etc.
Routes to: **Profile Agent** (when implemented)

### Theory Requests
Keywords: `theory`, `hypothesis`, `evidence for`, `validate`, `analyze theory`, etc.
Routes to: **Theory Agent** (when implemented)

### Script Queries
Keywords: `who is`, `what is`, `tell me about`, `what happens`, etc.
Routes to: **Query Agent**

### Unknown Queries
Default: Routes to **Query Agent** for general questions

## Usage

```typescript
import { OrchestratorAgent } from './agents/orchestrator';

const orchestrator = new OrchestratorAgent();

const result = await orchestrator.invokeAgent({
  query: 'Who is Rena?',
  identity: {
    userId: 'user-123',
    username: 'nick',
  },
  memory: {
    userId: 'user-123',
    sessionId: 'session-456',
    messages: [],
    lastAccessed: new Date(),
  },
});

console.log(result.content);
// Response from Query Agent with script citations
```

## Requirements Validation

- ✅ **3.1**: Explicit classification logic (keyword-based, not autonomous)
- ✅ **3.2**: Routes script content queries to Query Agent
- ⏳ **3.3**: Routes profile queries to Profile Agent (TODO: implement Profile Agent)
- ⏳ **3.4**: Routes theory queries to Theory Agent (TODO: implement Theory Agent)
- ✅ **3.5**: Logs all routing decisions for debugging

## Logging

All routing decisions are logged with:
- Query classification result
- Routing decision and reasoning
- Agent invocation details
- Processing time
- Error information (if applicable)

Example log entry:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "agent": "CICADA-Orchestrator",
  "level": "info",
  "message": "Query classified",
  "userId": "user-123",
  "queryType": "SCRIPT_QUERY",
  "query": "Who is Rena?"
}
```

## Error Handling

1. **Primary Error**: If orchestrator fails, attempts fallback to Query Agent
2. **Fallback Error**: If fallback also fails, returns user-friendly error message
3. **All Errors Logged**: Full error details captured for debugging

## Testing

See `__tests__/orchestrator-agent.test.ts` for:
- Classification logic tests
- Routing accuracy tests
- Error handling tests
- Logging verification tests

## Future Enhancements

- [ ] Implement Theory Agent integration
- [ ] Implement Profile Agent integration
- [ ] Add multi-agent workflows (e.g., Theory Agent → Query Agent)
- [ ] Add query intent confidence scoring
- [ ] Add support for compound queries (multiple intents)
