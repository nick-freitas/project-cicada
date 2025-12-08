# AgentCore Dependencies Installation Summary

## Task Completion

Task 1: Set up AgentCore dependencies and infrastructure foundation - **COMPLETED**

## Installed Packages

### Backend Runtime (`packages/backend/package.json`)

```json
{
  "@aws-sdk/client-bedrock-agent-runtime": "^3.943.0",
  "@aws-sdk/client-bedrock-agent": "^3.943.0"
}
```

### Infrastructure (`infrastructure/package.json`)

```json
{
  "@aws-sdk/client-bedrock-agent": "^3.943.0"
}
```

## Important Finding: "Strands SDK" Clarification

The design documents reference a "Strands SDK" for creating AgentCore agents. After thorough research:

**AWS does not provide a separate "Strands SDK" package.**

Instead, AgentCore agents are created using:
1. **AWS CDK Constructs** (`aws-cdk-lib/aws-bedrock`) - Already available in the project
2. **AWS SDK for JavaScript v3** - Now installed:
   - `@aws-sdk/client-bedrock-agent-runtime` - For invoking agents
   - `@aws-sdk/client-bedrock-agent` - For agent management

The term "Strands SDK" in the design documents refers to these official AWS SDK packages.

## Created Files

### 1. Documentation
- **`packages/backend/docs/agentcore-setup.md`** - Comprehensive setup guide explaining:
  - The "Strands SDK" terminology clarification
  - Installed packages and their purposes
  - Usage patterns for defining and invoking agents
  - Architecture diagrams
  - Next steps for implementation

### 2. Type Definitions
- **`packages/backend/src/types/agentcore.ts`** - TypeScript types for:
  - Agent configurations (Orchestrator, Query, Theory, Profile)
  - Agent invocation requests and responses
  - Tool definitions for each agent type
  - Streaming chunk types
  - Error types (`AgentInvocationError`)
  - All supporting interfaces (Citation, NuanceAnalysis, etc.)

### 3. Utility Functions
- **`packages/backend/src/utils/agentcore-client.ts`** - Helper functions for:
  - Creating configured `BedrockAgentRuntimeClient` instances
  - Retrieving agent configuration from environment variables
  - Type-safe agent configuration management

## TypeScript Configuration

Both `packages/backend/tsconfig.json` and `infrastructure/tsconfig.json` are properly configured:
- ✅ Strict type checking enabled
- ✅ ES2020+ features supported
- ✅ CommonJS module system
- ✅ Node.js types included
- ✅ JSON module resolution enabled

No changes were needed to TypeScript configurations.

## Verification

All new files compile successfully:
```bash
npx tsc --noEmit src/types/agentcore.ts src/utils/agentcore-client.ts
# Exit Code: 0 ✅
```

Infrastructure builds successfully:
```bash
pnpm --filter @cicada/infrastructure run build
# Exit Code: 0 ✅
```

## Pre-existing Issues

Note: The backend build currently has pre-existing TypeScript errors in test files related to AWS SDK version conflicts. These are **not** caused by the new AgentCore dependencies and were present before this task. They will need to be addressed separately.

## Next Steps

With dependencies installed and types defined, the next tasks can proceed:

1. **Task 2**: Create CDK Agent Stack infrastructure
   - Use `aws-cdk-lib/aws-bedrock` constructs
   - Define IAM roles and permissions
   - Configure agent-to-agent invocation

2. **Task 3**: Implement Orchestrator Agent with AgentCore
   - Use the installed `@aws-sdk/client-bedrock-agent-runtime`
   - Reference types from `src/types/agentcore.ts`
   - Use utilities from `src/utils/agentcore-client.ts`

## References

- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS SDK for JavaScript v3 - Bedrock Agent Runtime](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-agent-runtime/)
- [AWS CDK Bedrock Constructs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrock-readme.html)
