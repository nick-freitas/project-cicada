# Theory Agent

The Theory Agent is a specialized AgentCore agent for analyzing theories about Higurashi. It explicitly invokes the Query Agent to gather evidence before performing analysis.

## Features

- **Explicit Evidence Gathering**: Always invokes Query Agent to gather script evidence
- **Theory Analysis**: Evaluates theories against evidence, identifying support and contradictions
- **Profile Integration**: Automatically updates theory profiles in DynamoDB
- **Status Tracking**: Tracks theory status (ACTIVE, VALIDATED, REFUTED, ARCHIVED)
- **Analysis History**: Maintains history of all theory analyses

## Requirements

Implements requirements:
- 5.1: Maintain all existing functionality
- 5.2: Explicitly invoke Query Agent for evidence gathering
- 5.3: Stream responses via WebSocket
- 5.4: Update theory status in user profiles
- 5.5: Handle errors gracefully

## Usage

```typescript
import { TheoryAgent } from './agents/theory';

const theoryAgent = new TheoryAgent();

const result = await theoryAgent.invokeAgent({
  query: 'Theory: Rena knows about the time loops',
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

console.log(result.content); // Theory analysis with evidence
```

## Architecture

```
Theory Agent
    │
    ├─ Extract theory from query
    │
    ├─ Invoke Query Agent (sub-agent)
    │  └─ Gather evidence from script
    │
    ├─ Analyze theory against evidence
    │  ├─ Identify supporting evidence
    │  ├─ Identify contradicting evidence
    │  ├─ Suggest refinements
    │  └─ Determine status
    │
    └─ Update theory profile in DynamoDB
       ├─ Create or update profile
       ├─ Add to analysis history
       └─ Update status
```

## Theory Status

- **ACTIVE**: Theory is under investigation, inconclusive evidence
- **VALIDATED**: Theory is strongly supported by evidence
- **REFUTED**: Theory is contradicted by evidence
- **ARCHIVED**: Theory is no longer being actively investigated

## Profile Integration

The Theory Agent automatically creates and updates theory profiles in DynamoDB:

```typescript
interface TheoryProfile {
  userId: string;
  profileType: 'THEORY';
  profileId: string;
  theoryStatement: string;
  status: 'ACTIVE' | 'VALIDATED' | 'REFUTED' | 'ARCHIVED';
  lastAnalyzed: string;
  analysisHistory: Array<{
    timestamp: string;
    analysis: string;
    evidence: string;
    status: string;
  }>;
  relatedCharacters: string[];
  relatedEpisodes: string[];
  tags: string[];
}
```

## Error Handling

The Theory Agent handles errors gracefully:
- Query Agent failures are caught and logged
- Profile update failures don't fail the entire operation
- User-friendly error messages are returned
- All errors are logged for debugging

## Testing

See `__tests__/theory-agent.test.ts` for unit tests.

## Design Decisions

1. **Explicit Query Agent Invocation**: The Theory Agent ALWAYS invokes the Query Agent to gather evidence. This is deterministic - no autonomous decision-making.

2. **Profile Updates**: Theory profiles are automatically updated after each analysis, maintaining a complete history.

3. **Status Extraction**: Theory status is extracted from the analysis text using keyword matching. This could be enhanced with more sophisticated NLP.

4. **Theory ID Generation**: Theory IDs are generated from the theory statement using a simple slug algorithm. In production, might use a hash or UUID.

5. **Evidence Truncation**: Evidence is truncated to 500 characters when stored in profiles to avoid excessive storage costs.
