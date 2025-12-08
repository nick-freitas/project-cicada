# CICADA Backend Documentation

Comprehensive documentation for CICADA's backend implementation using AWS AgentCore.

## Quick Start

New to CICADA's AgentCore implementation? Start here:

1. **[AgentCore Quick Reference](./AGENTCORE_QUICK_REFERENCE.md)** - Quick reference for common tasks
2. **[AgentCore Setup](./agentcore-setup.md)** - SDK installation and configuration
3. **[Agent Invocation Examples](./AGENT_INVOCATION_EXAMPLES.md)** - Practical code examples

## Architecture Documentation

### Core Architecture
- **[AgentCore Architecture](./AGENTCORE_ARCHITECTURE.md)** - Complete multi-agent architecture guide
  - Agent roles and responsibilities
  - Communication patterns
  - Agent-to-agent invocation
  - Cost optimization
  - Security considerations

- **[Architecture Diagrams](../../docs/ARCHITECTURE_DIAGRAMS.md)** - Visual architecture diagrams
  - System architecture
  - Multi-agent coordination
  - Request flow
  - Data flow
  - Infrastructure stacks

### Implementation Guides

- **[Agent Invocation Examples](./AGENT_INVOCATION_EXAMPLES.md)** - Practical examples
  - Basic agent invocation
  - Agent-to-agent invocation
  - Streaming responses
  - Error handling
  - Multi-agent coordination
  - Testing patterns

- **[Streaming Implementation](./STREAMING_IMPLEMENTATION.md)** - Real-time streaming guide
  - WebSocket integration
  - Chunk storage and replay
  - Reconnection handling
  - Performance optimization
  - Error handling

- **[AgentCore Setup](./agentcore-setup.md)** - SDK setup and configuration
  - Package installation
  - CDK agent definitions
  - Runtime invocation
  - TypeScript configuration

## Operational Documentation

### Monitoring and Performance

- **[Monitoring and Observability](./monitoring-and-observability.md)** - CloudWatch metrics and logging
  - Agent-specific metrics
  - Dashboard configuration
  - Structured logging
  - X-Ray tracing
  - Alerting

- **[Performance Testing Guide](./performance-testing-guide.md)** - Performance optimization
  - Token usage optimization
  - Latency measurement
  - Cost tracking
  - Load testing
  - Optimization strategies

- **[Performance Quick Reference](./PERFORMANCE_QUICK_REFERENCE.md)** - Quick performance tips

### Knowledge Base

- **[Knowledge Base Setup](./knowledge-base-setup.md)** - Bedrock Knowledge Base configuration
  - S3 bucket setup
  - Embedding generation
  - Index configuration
  - Query patterns

## Specification Documents

### AgentCore Implementation Spec

Located in `.kiro/specs/agentcore-implementation/`:

- **[Requirements](../../.kiro/specs/agentcore-implementation/requirements.md)** - Detailed requirements with acceptance criteria
- **[Design](../../.kiro/specs/agentcore-implementation/design.md)** - Architecture and design decisions
- **[Tasks](../../.kiro/specs/agentcore-implementation/tasks.md)** - Implementation task list

### Task Summaries

Implementation progress documentation:

- [Task 4 Summary](./task-4-summary.md) - Message Processor update
- [Task 8 Summary](./task-8-summary.md) - Theory Agent coordination
- [Task 10 Summary](./task-10-summary.md) - Profile Agent coordination
- [Task 11 Summary](./task-11-summary.md) - Error handling
- [Task 12 Summary](./task-12-summary.md) - Environment configuration
- [Task 13 Summary](./task-13-checkpoint-summary.md) - End-to-end testing
- [Task 14 Summary](./task-14-summary.md) - Monitoring implementation
- [Task 16 Summary](./task-16-summary.md) - Integration tests
- [Task 17 Summary](./task-17-summary.md) - Performance testing

## Infrastructure Documentation

- **[Agent Stack README](../../infrastructure/lib/README-agent-stack.md)** - CDK Agent Stack documentation
  - Agent definitions
  - IAM permissions
  - Stack outputs
  - Deployment instructions

## Code Organization

### Source Code Structure

```
packages/backend/src/
├── agents/                    # Agent implementations (deprecated)
├── handlers/
│   ├── agents/               # Agent tool handlers
│   │   ├── orchestrator-agent-tools.ts
│   │   ├── query-agent-tools.ts
│   │   ├── theory-agent-tools.ts
│   │   └── profile-agent-tools.ts
│   ├── websocket/            # WebSocket handlers
│   │   ├── handler.ts
│   │   └── message-processor.ts
│   └── rest-api/             # REST API handlers
├── services/                 # Business logic services
│   ├── knowledge-base-service.ts
│   ├── profile-service.ts
│   ├── memory-service.ts
│   └── request-tracking-service.ts
└── utils/                    # Utility functions
    ├── agent-invocation.ts   # Agent invocation utilities
    ├── agentcore-client.ts   # AgentCore client wrapper
    ├── logger.ts             # Structured logging
    └── errors.ts             # Error classes
```

### Test Structure

```
packages/backend/test/
├── unit/                     # Unit tests
│   ├── handlers/
│   └── services/
├── integration/              # Integration tests
│   ├── orchestrator.test.ts
│   ├── agent-coordination.test.ts
│   └── knowledge-base.test.ts
└── property/                 # Property-based tests
    ├── agent-coordination-correctness.test.ts
    ├── citation-preservation.test.ts
    ├── profile-update-consistency.test.ts
    ├── error-recovery.test.ts
    ├── cost-efficiency.test.ts
    └── response-time-consistency.test.ts
```

## Key Concepts

### Multi-Agent Architecture

CICADA uses four specialized agents:

1. **Orchestrator Agent** - Central coordinator
   - Analyzes query intent
   - Routes to specialized agents
   - Aggregates responses

2. **Query Agent** - Script search specialist
   - Semantic search over Knowledge Base
   - Citation formatting
   - Nuance analysis

3. **Theory Agent** - Theory analysis specialist
   - Evidence gathering
   - Theory validation
   - Profile corrections

4. **Profile Agent** - Knowledge extraction specialist
   - Entity extraction
   - Profile management
   - User-scoped data

### Agent Coordination

Agents coordinate through tool-based invocation:

```
User Query
    ↓
Orchestrator (analyzes intent)
    ↓
[Invokes specialized agents as needed]
    ↓
Query Agent (searches scripts)
Theory Agent (analyzes theories)
Profile Agent (extracts knowledge)
    ↓
Orchestrator (aggregates)
    ↓
Streaming response to user
```

### Streaming Responses

All agents (except Profile) support streaming:

1. Agent generates response chunks
2. Chunks stored in DynamoDB
3. Chunks forwarded to WebSocket
4. User sees real-time updates
5. Reconnection supported via stored chunks

### Cost Optimization

System designed for <$100/month operation:

- Nova Lite model for all agents (~$0.06-0.24 per 1M tokens)
- Targeted agent invocation (only invoke what's needed)
- Context compaction (reduce token usage)
- Efficient tool definitions
- On-demand pricing (no reserved capacity)

Average cost per query: ~$0.0003

## Common Tasks

### Invoke an Agent

```typescript
import { invokeAgentWithRetry } from '../utils/agent-invocation';

const result = await invokeAgentWithRetry({
  agentId: process.env.ORCHESTRATOR_AGENT_ID!,
  agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID!,
  sessionId: sessionId,
  inputText: query,
});
```

### Stream to WebSocket

```typescript
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    const text = new TextDecoder().decode(chunk.chunk.bytes);
    await sendToWebSocket(connectionId, {
      type: 'chunk',
      content: text,
    });
  }
}
```

### Handle Errors

```typescript
try {
  const result = await invokeAgent(agentId, query);
} catch (error) {
  if (error instanceof AgentInvocationError) {
    logger.error('Agent failed', {
      agentName: error.agentName,
      retryable: error.retryable,
    });
  }
}
```

## Testing

### Run All Tests

```bash
cd packages/backend

# Unit tests
pnpm test:unit

# Integration tests (requires deployed agents)
pnpm test:integration

# Property-based tests
pnpm test:property

# All tests
pnpm test
```

### Test Specific Agent

```bash
# Test orchestrator
pnpm test test/integration/orchestrator.test.ts

# Test agent coordination
pnpm test test/integration/agent-coordination.test.ts
```

## Deployment

### Deploy Agent Stack

```bash
cd infrastructure
pnpm cdk deploy ProjectCICADAAgentStack
```

### Update Environment Variables

After deployment, update `.env.nonprod` or `.env.prod` with agent IDs from stack outputs.

### Verify Deployment

```bash
# List agents
aws bedrock-agent list-agents --region us-east-1

# Test invocation
cd packages/backend
pnpm test test/integration/orchestrator.test.ts
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Agent not found | Verify agent ID and alias ID in environment variables |
| Permission denied | Check Lambda execution role has `bedrock:InvokeAgent` permission |
| Streaming timeout | Increase Lambda timeout to 5+ minutes |
| High latency | Optimize agent instructions, reduce context size |
| High costs | Monitor token usage, optimize agent invocation patterns |

### Debug Logging

Enable trace logging:

```typescript
const command = new InvokeAgentCommand({
  agentId,
  agentAliasId,
  sessionId,
  inputText: query,
  enableTrace: true, // Enable detailed tracing
});
```

View logs:

```bash
aws logs tail /aws/lambda/CICADA-MessageProcessor --follow
```

## Contributing

When adding new features:

1. Update relevant documentation
2. Add tests (unit, integration, property-based)
3. Update architecture diagrams if needed
4. Add examples to invocation guide
5. Update quick reference

## External Resources

- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Amazon Nova Models](https://aws.amazon.com/bedrock/nova/)

## Support

For questions or issues:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [Architecture Documentation](#architecture-documentation)
3. Check [Agent Invocation Examples](./AGENT_INVOCATION_EXAMPLES.md)
4. Review CloudWatch logs and metrics
