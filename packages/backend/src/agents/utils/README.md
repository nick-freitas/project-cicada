# Agent Utilities

This directory contains utility functions for building and coordinating AgentCore agents in CICADA.

## Sub-Agent Invocation Utilities

The sub-agent invocation utilities provide a robust framework for agent-to-agent communication with proper context propagation, execution tracing, and error handling.

### Core Functions

#### `invokeSubAgent()`

Invoke a sub-agent with proper identity propagation, memory context passing, and execution trace logging.

```typescript
import { invokeSubAgent } from './utils';
import { QueryAgent } from './query';

const queryAgent = new QueryAgent();

const result = await invokeSubAgent(queryAgent, 'Who is Rena?', {
  callingAgent: 'OrchestratorAgent',
  subAgentName: 'QueryAgent',
  identity: userIdentity,
  memory: conversationMemory,
  context: { additionalData: 'value' },
});

console.log(result.content); // Agent response
console.log(result.trace);   // Execution trace information
```

**Features:**
- ✅ Automatic identity propagation (Requirement 7.4)
- ✅ Memory context passing (Requirement 7.3)
- ✅ Execution trace logging (Requirement 7.2)
- ✅ Error handling with user-friendly messages (Requirement 7.5)
- ✅ Trace ID generation and propagation

#### `invokeSubAgentsSequentially()`

Invoke multiple sub-agents in sequence, passing the output of each to the next.

```typescript
import { invokeSubAgentsSequentially } from './utils';

const results = await invokeSubAgentsSequentially(
  [
    { agent: queryAgent, name: 'QueryAgent' },
    { agent: theoryAgent, name: 'TheoryAgent' },
    { agent: profileAgent, name: 'ProfileAgent' },
  ],
  'Initial query',
  {
    callingAgent: 'OrchestratorAgent',
    identity: userIdentity,
    memory: conversationMemory,
  }
);

// results[0] = QueryAgent output
// results[1] = TheoryAgent output (received QueryAgent output as input)
// results[2] = ProfileAgent output (received TheoryAgent output as input)
```

**Features:**
- ✅ Sequential execution with output chaining
- ✅ Automatic stop on failure
- ✅ Shared trace ID across all invocations
- ✅ Full execution trace for debugging

#### `invokeSubAgentsInParallel()`

Invoke multiple sub-agents concurrently for parallel information gathering.

```typescript
import { invokeSubAgentsInParallel } from './utils';

const results = await invokeSubAgentsInParallel(
  [
    { agent: queryAgent1, name: 'QueryAgent1' },
    { agent: queryAgent2, name: 'QueryAgent2' },
    { agent: queryAgent3, name: 'QueryAgent3' },
  ],
  ['Query 1', 'Query 2', 'Query 3'],
  {
    callingAgent: 'OrchestratorAgent',
    identity: userIdentity,
    memory: conversationMemory,
  }
);

// All agents execute concurrently
// results[0] = QueryAgent1 output
// results[1] = QueryAgent2 output
// results[2] = QueryAgent3 output
```

**Features:**
- ✅ Concurrent execution for performance
- ✅ Individual error handling (one failure doesn't stop others)
- ✅ Shared trace ID across all invocations
- ✅ Full execution trace for debugging

#### `extractExecutionTrace()`

Extract and format execution trace information from sub-agent results.

```typescript
import { extractExecutionTrace } from './utils';

const trace = extractExecutionTrace(results);

console.log(trace);
// Output:
// Execution Trace:
//
// 1. OrchestratorAgent → QueryAgent
//    Trace ID: trace-1234567890-abc123
//    Duration: 1234ms
//    Success: true
//    Agents Invoked: QueryAgent
//    Tools Used: semanticSearch
//
// 2. OrchestratorAgent → TheoryAgent
//    ...
```

**Features:**
- ✅ Formatted execution trace for debugging
- ✅ Includes timing information
- ✅ Shows success/failure status
- ✅ Lists agents and tools involved

## Requirements Validation

This implementation satisfies the following requirements from the AgentCore Migration spec:

### Requirement 7.1: Sub-Agent Registration and Invocation
- ✅ `invokeSubAgent()` provides the core invocation mechanism
- ✅ Supports both single and multiple sub-agent invocations
- ✅ Handles agent-to-agent communication

### Requirement 7.2: Execution Trace Logging
- ✅ All invocations are logged with structured JSON
- ✅ Trace IDs enable tracking of agent chains
- ✅ `extractExecutionTrace()` provides formatted trace output
- ✅ Logs include timing, success/failure, and metadata

### Requirement 7.3: Memory Context Passing
- ✅ Conversation memory is validated and passed to all sub-agents
- ✅ Memory context includes message history and session information
- ✅ Sub-agents receive full conversation context

### Requirement 7.4: Identity Propagation
- ✅ User identity is validated before invocation
- ✅ Identity is passed to all sub-agents for access control
- ✅ Ensures data isolation and user-scoped operations

### Requirement 7.5: Error Handling for Sub-Agent Failures
- ✅ Graceful error handling with user-friendly messages
- ✅ Errors are logged with full stack traces
- ✅ Failed invocations return error results with trace information
- ✅ Sequential invocations stop on failure
- ✅ Parallel invocations continue despite individual failures

## Usage Examples

### Example 1: Orchestrator Invoking Query Agent

```typescript
import { OrchestratorAgent } from './orchestrator';
import { QueryAgent } from './query';
import { invokeSubAgent } from './utils';

class OrchestratorAgent extends CICADAAgentBase {
  private queryAgent: QueryAgent;

  constructor() {
    super({ name: 'CICADA-Orchestrator', ... });
    this.queryAgent = new QueryAgent();
  }

  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    // Invoke Query Agent as sub-agent
    const result = await invokeSubAgent(
      this.queryAgent,
      params.query,
      {
        callingAgent: 'CICADA-Orchestrator',
        subAgentName: 'CICADA-Query',
        identity: params.identity,
        memory: params.memory,
        context: params.context,
      }
    );

    return {
      content: result.content,
      metadata: {
        agentsInvoked: ['Orchestrator', ...result.metadata?.agentsInvoked || []],
        toolsUsed: result.metadata?.toolsUsed || [],
        processingTime: result.trace.duration,
      },
    };
  }
}
```

### Example 2: Theory Agent Gathering Evidence

```typescript
import { TheoryAgent } from './theory';
import { QueryAgent } from './query';
import { invokeSubAgent } from './utils';

class TheoryAgent extends CICADAAgentBase {
  private queryAgent: QueryAgent;

  constructor() {
    super({ name: 'CICADA-Theory', ... });
    this.queryAgent = new QueryAgent();
  }

  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    // Extract theory from query
    const theory = this.extractTheory(params.query);

    // Gather evidence via Query Agent
    const evidenceResult = await invokeSubAgent(
      this.queryAgent,
      `Find evidence related to: ${theory}`,
      {
        callingAgent: 'CICADA-Theory',
        subAgentName: 'CICADA-Query',
        identity: params.identity,
        memory: params.memory,
      }
    );

    // Analyze theory against evidence
    const analysis = await this.analyzeTheory(theory, evidenceResult.content);

    return {
      content: analysis,
      metadata: {
        agentsInvoked: ['TheoryAgent', 'QueryAgent'],
        toolsUsed: ['semanticSearch'],
        processingTime: evidenceResult.trace.duration,
      },
    };
  }
}
```

### Example 3: Parallel Evidence Gathering

```typescript
import { invokeSubAgentsInParallel } from './utils';

// Gather evidence from multiple sources in parallel
const results = await invokeSubAgentsInParallel(
  [
    { agent: queryAgent, name: 'QueryAgent-Characters' },
    { agent: queryAgent, name: 'QueryAgent-Locations' },
    { agent: queryAgent, name: 'QueryAgent-Events' },
  ],
  [
    'Find information about characters',
    'Find information about locations',
    'Find information about events',
  ],
  {
    callingAgent: 'TheoryAgent',
    identity: userIdentity,
    memory: conversationMemory,
  }
);

// Combine results
const combinedEvidence = results
  .filter(r => r.trace.success)
  .map(r => r.content)
  .join('\n\n');
```

## Testing

Comprehensive unit tests are provided in `__tests__/sub-agent-invocation.test.ts`:

- ✅ Identity propagation validation
- ✅ Memory context passing validation
- ✅ Execution trace generation
- ✅ Error handling for failures
- ✅ Sequential invocation with chaining
- ✅ Parallel invocation with concurrency
- ✅ Trace ID generation and propagation
- ✅ Input validation

Run tests:
```bash
pnpm test -- sub-agent-invocation.test.ts --run
```

## Architecture

The sub-agent invocation utilities follow these design principles:

1. **Explicit Context Propagation**: Identity and memory are explicitly passed, never implicit
2. **Comprehensive Logging**: All invocations are logged with structured JSON for debugging
3. **Graceful Error Handling**: Errors are caught, logged, and returned as user-friendly messages
4. **Trace ID Consistency**: Single trace ID tracks entire agent chain for debugging
5. **Type Safety**: Full TypeScript types for all parameters and return values

## Performance Considerations

- **Sequential Invocation**: Use when output of one agent is needed as input to the next
- **Parallel Invocation**: Use when gathering independent information from multiple sources
- **Trace Logging**: Structured JSON logs enable efficient log aggregation and analysis
- **Error Isolation**: Parallel invocations continue despite individual failures

## Future Enhancements

Potential improvements for future iterations:

- [ ] Retry logic for transient failures
- [ ] Circuit breaker pattern for failing sub-agents
- [ ] Caching of sub-agent results
- [ ] Rate limiting for sub-agent invocations
- [ ] Metrics collection (invocation count, duration, success rate)
- [ ] Distributed tracing integration (X-Ray, OpenTelemetry)
