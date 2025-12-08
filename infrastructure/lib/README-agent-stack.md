# Agent Stack

The Agent Stack defines AWS AgentCore agents for the CICADA multi-agent system.

## Overview

This stack creates four specialized agents using AWS Bedrock AgentCore:

1. **Orchestrator Agent**: Central coordinator that analyzes query intent and routes to specialized agents
2. **Query Agent**: Script search and citation specialist
3. **Theory Agent**: Theory analysis and validation specialist
4. **Profile Agent**: Knowledge extraction and profile management specialist

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT                              │
│  - Query intent analysis                                     │
│  - Agent routing logic                                       │
│  - Response aggregation                                      │
│  - Conversation context management                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Agent-to-Agent Invocation
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ QUERY AGENT  │    │ THEORY AGENT │    │PROFILE AGENT │
│              │    │              │    │              │
│ - Semantic   │    │ - Theory     │    │ - Info       │
│   search     │    │   analysis   │    │   extraction │
│ - Citations  │    │ - Evidence   │    │ - Profile    │
│ - Nuances    │    │   gathering  │    │   updates    │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Resources Created

### IAM Role
- **AgentExecutionRole**: Shared execution role for all agents with permissions for:
  - Bedrock model invocation (Nova Lite, Nova Micro, Titan Embeddings)
  - DynamoDB access (UserProfiles, ConversationMemory, FragmentGroups, EpisodeConfig, RequestTracking)
  - S3 access (KnowledgeBase, ScriptData buckets)
  - Agent-to-agent invocation
  - CloudWatch Logs

### Agents
- **OrchestratorAgent**: Central coordinator (Nova Lite, streaming enabled)
- **QueryAgent**: Script search specialist (Nova Lite, streaming enabled)
- **TheoryAgent**: Theory analysis specialist (Nova Lite, streaming enabled)
- **ProfileAgent**: Profile management specialist (Nova Lite, streaming disabled)

### Agent Aliases
Each agent has a production alias (`prod`) for stable invocation:
- **OrchestratorAlias**
- **QueryAlias**
- **TheoryAlias**
- **ProfileAlias**

## Stack Outputs

The stack exports the following outputs for use by other stacks:

### Agent IDs
- `CICADAOrchestratorAgentId`
- `CICADAQueryAgentId`
- `CICADATheoryAgentId`
- `CICADAProfileAgentId`

### Agent Alias IDs
- `CICADAOrchestratorAgentAliasId`
- `CICADAQueryAgentAliasId`
- `CICADATheoryAgentAliasId`
- `CICADAProfileAgentAliasId`

### Agent ARNs
- `OrchestratorAgentArn`
- `QueryAgentArn`
- `TheoryAgentArn`
- `ProfileAgentArn`

## Dependencies

This stack depends on:
- **DataStack**: For DynamoDB tables and S3 buckets

## Deployment

### Deploy Agent Stack Only
```bash
cd infrastructure
pnpm run deploy:agent
```

### Deploy All Stacks
```bash
cd infrastructure
pnpm run deploy
```

### View Agent Stack Template
```bash
cd infrastructure
pnpm cdk synth ProjectCICADAAgentStack
```

### Check Differences Before Deployment
```bash
cd infrastructure
pnpm run diff
```

## Agent Configuration

### Foundation Model
All agents use **Amazon Nova Lite** (`amazon.nova-lite-v1:0`) for cost optimization while maintaining good performance.

### Session Timeout
All agents have a 10-minute idle session timeout (`idleSessionTtlInSeconds: 600`).

### Streaming
- **Orchestrator, Query, Theory**: Streaming enabled for real-time responses
- **Profile**: Streaming disabled (transactional operations)

## Agent Instructions

Each agent has specialized instructions that define its behavior:

### Orchestrator Agent
- Analyzes user queries to determine intent
- Routes to appropriate specialized agents
- Coordinates multiple agents when needed
- Aggregates and synthesizes responses
- Maintains conversation context and episode boundaries

### Query Agent
- Performs semantic search over script data
- Formats citations with complete metadata
- Analyzes linguistic nuances between Japanese and English
- Enforces episode boundary constraints
- Focuses on character-specific information

### Theory Agent
- Analyzes user theories about the narrative
- Gathers supporting and contradicting evidence
- Identifies profile corrections
- Generates theory refinement suggestions
- Maintains evidence-based reasoning

### Profile Agent
- Extracts character, location, episode, and theory information
- Creates and updates user-specific profiles
- Maintains profile consistency and accuracy
- Ensures user isolation (profiles never shared between users)

## Permissions

### Bedrock Model Access
Agents can invoke:
- `amazon.nova-lite-v1:0` (primary model)
- `amazon.nova-micro-v1:0` (backup for lower cost)
- `amazon.titan-embed-text-v1` (embeddings)
- `amazon.titan-embed-text-v2:0` (embeddings)

### DynamoDB Access
Agents have read/write access to:
- UserProfiles table
- ConversationMemory table
- FragmentGroups table
- RequestTracking table
- EpisodeConfiguration table (read-only)

### S3 Access
Agents have read access to:
- KnowledgeBase bucket (embeddings and indexed data)
- ScriptData bucket (raw script data)

### Agent-to-Agent Invocation
All agents can invoke other agents via `bedrock:InvokeAgent` permission.

## Cost Optimization

The agent stack is designed for cost efficiency:

1. **Nova Lite Model**: Most cost-effective model that meets requirements
2. **Shared Execution Role**: Single role reduces IAM complexity
3. **On-Demand Pricing**: No reserved capacity or minimum charges
4. **Efficient Instructions**: Concise agent instructions reduce token usage
5. **Targeted Streaming**: Only enabled where needed for user experience

Estimated cost per 100 queries: ~$0.03 (see design document for detailed breakdown)

## Next Steps

After deploying the agent stack:

1. **Task 3**: Implement Orchestrator Agent with AgentCore
2. **Task 4**: Update Message Processor to invoke Orchestrator
3. **Task 5**: Implement Query Agent with AgentCore
4. **Task 6**: Configure Orchestrator to invoke Query Agent
5. **Task 7**: Implement Theory Agent with AgentCore
6. **Task 8**: Configure Orchestrator to invoke Theory Agent
7. **Task 9**: Implement Profile Agent with AgentCore
8. **Task 10**: Configure Orchestrator to invoke Profile Agent

## Troubleshooting

### Agent Not Found
If you get "Agent not found" errors, ensure:
- The DataStack is deployed first
- The AgentStack deployment completed successfully
- You're using the correct agent ID and alias ID from stack outputs

### Permission Denied
If you get permission errors:
- Check that the AgentExecutionRole has the necessary permissions
- Verify the agent is using the correct role ARN
- Ensure cross-stack references are resolving correctly

### Deployment Fails
If deployment fails:
- Check CloudFormation console for detailed error messages
- Verify all dependencies (DataStack) are deployed
- Ensure you have sufficient AWS permissions to create Bedrock agents
- Check that Bedrock is available in your region (us-east-1 recommended)

## References

### Documentation
- [AgentCore Architecture](../../packages/backend/docs/AGENTCORE_ARCHITECTURE.md) - Complete architecture guide
- [Agent Invocation Examples](../../packages/backend/docs/AGENT_INVOCATION_EXAMPLES.md) - Practical code examples
- [Streaming Implementation](../../packages/backend/docs/STREAMING_IMPLEMENTATION.md) - Streaming guide
- [Quick Reference](../../packages/backend/docs/AGENTCORE_QUICK_REFERENCE.md) - Quick reference guide
- [Architecture Diagrams](../../docs/ARCHITECTURE_DIAGRAMS.md) - Visual diagrams

### Specification
- [AgentCore Implementation Design](../../.kiro/specs/agentcore-implementation/design.md)
- [AgentCore Implementation Requirements](../../.kiro/specs/agentcore-implementation/requirements.md)
- [AgentCore Implementation Tasks](../../.kiro/specs/agentcore-implementation/tasks.md)

### AWS Documentation
- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS SDK for JavaScript v3 - Bedrock Agent Runtime](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent-runtime/)
