# AgentCore Quick Reference

Quick reference guide for working with CICADA's AgentCore implementation.

## Agent IDs (Environment Variables)

```bash
# Orchestrator Agent
ORCHESTRATOR_AGENT_ID=<from-cdk-output>
ORCHESTRATOR_AGENT_ALIAS_ID=<from-cdk-output>

# Query Agent
QUERY_AGENT_ID=<from-cdk-output>
QUERY_AGENT_ALIAS_ID=<from-cdk-output>

# Theory Agent
THEORY_AGENT_ID=<from-cdk-output>
THEORY_AGENT_ALIAS_ID=<from-cdk-output>

# Profile Agent
PROFILE_AGENT_ID=<from-cdk-output>
PROFILE_AGENT_ALIAS_ID=<from-cdk-output>
```

## Quick Invocation

### Invoke Orchestrator

```typescript
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

const response = await client.send(new InvokeAgentCommand({
  agentId: process.env.ORCHESTRATOR_AGENT_ID!,
  agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
  sessionId: sessionId,
  inputText: query,
}));

// Collect response
let fullResponse = '';
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
  }
}
```

### Invoke with Retry

```typescript
import { invokeAgentWithRetry } from '../utils/agent-invocation';

const result = await invokeAgentWithRetry({
  agentId: process.env.ORCHESTRATOR_AGENT_ID!,
  agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
  sessionId: sessionId,
  inputText: query,
  maxRetries: 3,
});
```

## Agent Roles

| Agent | Purpose | Model | Streaming |
|-------|---------|-------|-----------|
| **Orchestrator** | Central coordinator, intent analysis, routing | Nova Lite | ✅ Enabled |
| **Query** | Script search, citations, nuance analysis | Nova Lite | ✅ Enabled |
| **Theory** | Theory analysis, evidence gathering | Nova Lite | ✅ Enabled |
| **Profile** | Knowledge extraction, profile management | Nova Lite | ❌ Disabled |

## Agent Tools

### Orchestrator Tools

- `invoke_query_agent` - Invoke Query Agent for script searches
- `invoke_theory_agent` - Invoke Theory Agent for theory analysis
- `invoke_profile_agent` - Invoke Profile Agent for knowledge extraction

### Query Tools

- `search_knowledge_base` - Search script data
- `format_citation` - Format search results as citations
- `analyze_nuance` - Compare Japanese/English text

### Theory Tools

- `invoke_query_agent` - Gather evidence via Query Agent
- `access_profile` - Retrieve profile data
- `update_profile` - Correct profile information

### Profile Tools

- `extract_entity` - Extract entity information
- `get_profile` - Retrieve existing profile
- `create_profile` - Create new profile
- `update_profile` - Update profile data

## Common Patterns

### Pattern 1: Basic Invocation

```typescript
const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const command = new InvokeAgentCommand({ agentId, agentAliasId, sessionId, inputText });
const response = await client.send(command);
```

### Pattern 2: Streaming to WebSocket

```typescript
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    const text = new TextDecoder().decode(chunk.chunk.bytes);
    await sendToWebSocket(connectionId, { type: 'chunk', content: text });
  }
}
```

### Pattern 3: Error Handling

```typescript
try {
  const result = await invokeAgent(agentId, query);
} catch (error) {
  if (error instanceof AgentInvocationError) {
    logger.error('Agent failed', { agentName: error.agentName });
  }
}
```

## Cost Estimates

| Operation | Tokens | Cost |
|-----------|--------|------|
| Orchestrator invocation | ~600 | $0.000045 |
| Query Agent invocation | ~950 | $0.000093 |
| Theory Agent invocation | ~950 | $0.000111 |
| Profile Agent invocation | ~550 | $0.000051 |
| **Average per query** | ~2000 | **$0.0003** |
| **100 queries/month** | ~200K | **$0.03** |

## Monitoring

### CloudWatch Metrics

```typescript
// Namespace: CICADA/Agents
- AgentInvocationCount
- AgentInvocationDuration
- AgentInvocationErrors
- AgentTokenUsage
- AgentCoordinationLatency
```

### Logs

```typescript
logger.info('Agent invocation', {
  agentName: 'Orchestrator',
  sessionId,
  queryLength: query.length,
});
```

## Testing

### Unit Test

```typescript
import { mockClient } from 'aws-sdk-client-mock';

const agentMock = mockClient(BedrockAgentRuntimeClient);
agentMock.on(InvokeAgentCommand).resolves({ completion: mockStream });
```

### Integration Test

```typescript
const result = await invokeOrchestrator('test query', 'user-id', 'session-id');
expect(result).toBeTruthy();
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent not found | Verify agent ID and alias ID are correct |
| Permission denied | Check Lambda execution role has `bedrock:InvokeAgent` |
| Streaming timeout | Increase Lambda timeout to 5+ minutes |
| High latency | Check agent instructions aren't too long |

## File Locations

| Component | Location |
|-----------|----------|
| Agent Stack | `infrastructure/lib/agent-stack.ts` |
| Orchestrator Tools | `packages/backend/src/handlers/agents/orchestrator-agent-tools.ts` |
| Query Tools | `packages/backend/src/handlers/agents/query-agent-tools.ts` |
| Theory Tools | `packages/backend/src/handlers/agents/theory-agent-tools.ts` |
| Profile Tools | `packages/backend/src/handlers/agents/profile-agent-tools.ts` |
| Agent Invocation Utils | `packages/backend/src/utils/agent-invocation.ts` |
| Message Processor | `packages/backend/src/handlers/websocket/message-processor.ts` |

## Useful Commands

```bash
# Deploy agent stack
cd infrastructure
pnpm cdk deploy ProjectCICADAAgentStack

# View agent stack outputs
pnpm cdk deploy ProjectCICADAAgentStack --outputs-file outputs.json

# Test agent invocation
cd packages/backend
pnpm test test/integration/orchestrator.test.ts

# View agent logs
aws logs tail /aws/lambda/CICADA-MessageProcessor --follow

# List agents
aws bedrock-agent list-agents --region us-east-1
```

## References

- [Full Architecture Documentation](./AGENTCORE_ARCHITECTURE.md)
- [Invocation Examples](./AGENT_INVOCATION_EXAMPLES.md)
- [Streaming Guide](./STREAMING_IMPLEMENTATION.md)
- [Agent Stack README](../../infrastructure/lib/README-agent-stack.md)
