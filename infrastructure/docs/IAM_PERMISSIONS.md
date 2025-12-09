# AgentCore Lambda IAM Permissions

This document describes the IAM permissions configured for all AgentCore Lambda functions in the CICADA multi-agent system.

## Overview

All AgentCore Lambda functions follow the principle of least privilege, granting only the permissions necessary for their specific responsibilities. Permissions are organized into five categories:

1. **DynamoDB Access** - For profiles, memory, and configuration data
2. **S3 Access** - For knowledge base embeddings and script data
3. **Bedrock Model Invocation** - For AI inference
4. **Lambda Invoke** - For agent-to-agent communication
5. **CloudWatch Logs** - For logging and monitoring

## Permission Matrix

| Lambda Function | DynamoDB Tables | S3 Buckets | Bedrock | Lambda Invoke | CloudWatch Logs |
|----------------|-----------------|------------|---------|---------------|-----------------|
| **Gateway** | UserProfiles (RW), ConversationMemory (RW), FragmentGroups (R), EpisodeConfig (R) | KnowledgeBase (R) | ✓ | All agents | ✓ |
| **Orchestrator** | ConversationMemory (R) | - | ✓ | Query, Theory, Profile | ✓ |
| **Query Agent** | EpisodeConfig (R) | KnowledgeBase (R), ScriptData (R) | ✓ | - | ✓ |
| **Theory Agent** | UserProfiles (RW), ConversationMemory (R) | - | ✓ | Query | ✓ |
| **Profile Agent** | UserProfiles (RW), FragmentGroups (RW), EpisodeConfig (R) | - | ✓ | - | ✓ |

**Legend:**
- R = Read access
- RW = Read/Write access
- ✓ = Permission granted
- \- = No access needed

## Detailed Permissions by Lambda Function

### 1. Gateway Lambda

**Purpose:** Entry point for all AgentCore requests, manages identity, policy, and memory services.

**Permissions:**

#### DynamoDB
- **UserProfiles** (Read/Write)
  - Purpose: Manage user profile data for identity and policy enforcement
  - Actions: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:Query`, `dynamodb:Scan`
  
- **ConversationMemory** (Read/Write)
  - Purpose: Store and retrieve conversation history for context
  - Actions: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:Query`, `dynamodb:Scan`
  
- **FragmentGroups** (Read)
  - Purpose: Access fragment group metadata for episode boundary enforcement
  - Actions: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`
  
- **EpisodeConfig** (Read)
  - Purpose: Access episode configuration for routing decisions
  - Actions: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`

#### S3
- **KnowledgeBase** (Read)
  - Purpose: Potential direct access to embeddings for optimization
  - Actions: `s3:GetObject`, `s3:ListBucket`

#### Bedrock
- **Model Invocation**
  - Purpose: Potential direct inference for simple queries
  - Actions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`
  - Resources: `*` (Bedrock models don't have specific ARNs)

#### Lambda
- **Invoke Permissions**
  - Orchestrator Agent
  - Query Agent
  - Theory Agent
  - Profile Agent
  - Purpose: Route requests to appropriate agents
  - Actions: `lambda:InvokeFunction`

#### CloudWatch Logs
- **Logging**
  - Purpose: Application logging and debugging
  - Actions: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
  - Resources: `/aws/lambda/CICADAAgentStack-Gateway:*`

---

### 2. Orchestrator Lambda

**Purpose:** Central coordinator that routes queries to specialized agents using explicit classification logic.

**Permissions:**

#### DynamoDB
- **ConversationMemory** (Read)
  - Purpose: Access conversation history for context-aware routing
  - Actions: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`

#### Bedrock
- **Model Invocation**
  - Purpose: Optional LLM-based classification if keyword matching is insufficient
  - Actions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`
  - Resources: `*`

#### Lambda
- **Invoke Permissions**
  - Query Agent
  - Theory Agent
  - Profile Agent
  - Purpose: Invoke specialized agents based on query classification
  - Actions: `lambda:InvokeFunction`

#### CloudWatch Logs
- **Logging**
  - Purpose: Log routing decisions for debugging
  - Actions: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
  - Resources: `/aws/lambda/CICADAAgentStack-Orchestrator:*`

---

### 3. Query Agent Lambda

**Purpose:** Script search and citation specialist with deterministic semantic search invocation.

**Permissions:**

#### DynamoDB
- **EpisodeConfig** (Read)
  - Purpose: Access episode metadata for search filtering and boundary enforcement
  - Actions: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`

#### S3
- **KnowledgeBase** (Read)
  - Purpose: Load embeddings for semantic search
  - Actions: `s3:GetObject`, `s3:ListBucket`
  
- **ScriptData** (Read)
  - Purpose: Access original script data for citation formatting
  - Actions: `s3:GetObject`, `s3:ListBucket`

#### Bedrock
- **Model Invocation**
  - Purpose: Generate responses based on search results
  - Actions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`
  - Resources: `*`

#### CloudWatch Logs
- **Logging**
  - Purpose: Log search operations and results
  - Actions: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
  - Resources: `/aws/lambda/CICADAAgentStack-QueryAgent:*`

---

### 4. Theory Agent Lambda

**Purpose:** Theory analysis and validation specialist with explicit Query Agent invocation for evidence gathering.

**Permissions:**

#### DynamoDB
- **UserProfiles** (Read/Write)
  - Purpose: Store and update theory profiles
  - Actions: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:Query`, `dynamodb:Scan`
  
- **ConversationMemory** (Read)
  - Purpose: Access conversation history for theory context
  - Actions: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`

#### Bedrock
- **Model Invocation**
  - Purpose: Analyze theories against evidence
  - Actions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`
  - Resources: `*`

#### Lambda
- **Invoke Permissions**
  - Query Agent
  - Purpose: Gather evidence from script database
  - Actions: `lambda:InvokeFunction`

#### CloudWatch Logs
- **Logging**
  - Purpose: Log theory analysis operations
  - Actions: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
  - Resources: `/aws/lambda/CICADAAgentStack-TheoryAgent:*`

---

### 5. Profile Agent Lambda

**Purpose:** Profile management specialist with explicit profile service tool invocation.

**Permissions:**

#### DynamoDB
- **UserProfiles** (Read/Write)
  - Purpose: CRUD operations on character, location, episode, and theory profiles
  - Actions: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem`, `dynamodb:Query`, `dynamodb:Scan`
  
- **FragmentGroups** (Read/Write)
  - Purpose: Manage fragment group associations
  - Actions: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:Query`, `dynamodb:Scan`
  
- **EpisodeConfig** (Read)
  - Purpose: Access episode metadata for profile context
  - Actions: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`

#### Bedrock
- **Model Invocation**
  - Purpose: Generate profile summaries and insights
  - Actions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`
  - Resources: `*`

#### CloudWatch Logs
- **Logging**
  - Purpose: Log profile operations
  - Actions: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
  - Resources: `/aws/lambda/CICADAAgentStack-ProfileAgent:*`

---

## Security Considerations

### Principle of Least Privilege

Each Lambda function is granted only the minimum permissions required for its specific responsibilities:

- **Query Agent** has no DynamoDB write access (read-only for episode config)
- **Orchestrator** has no direct data access (only routing)
- **Theory Agent** can only read conversation memory (no write)
- **Profile Agent** has no S3 access (only DynamoDB)
- **Gateway** has comprehensive access as the entry point and coordinator

### User Data Isolation

All DynamoDB operations are scoped to `userId` to ensure strict data isolation:

- Users can only access their own profiles
- Users can only access their own conversation history
- Users can only access their own theories

This is enforced at the application level in each agent's code, with IAM permissions providing defense in depth.

### Bedrock Model Access

All agents have wildcard access to Bedrock models (`resources: ['*']`) because:

1. Bedrock models don't have specific ARNs
2. Model selection is controlled via environment variables
3. Cost is controlled through Lambda execution limits and rate limiting

### CloudWatch Logs

All agents have explicit CloudWatch Logs permissions for:

- Debugging and troubleshooting
- Audit trails for tool invocations
- Performance monitoring
- Cost tracking

Log retention is set to 7 days for cost optimization.

---

## Environment Variables

Each Lambda function receives environment variables for resource access:

### Gateway
```typescript
ORCHESTRATOR_FUNCTION_ARN
QUERY_FUNCTION_ARN
THEORY_FUNCTION_ARN
PROFILE_FUNCTION_ARN
USER_PROFILES_TABLE
CONVERSATION_MEMORY_TABLE
FRAGMENT_GROUPS_TABLE
EPISODE_CONFIG_TABLE
KNOWLEDGE_BASE_BUCKET
MODEL_ID
```

### Orchestrator
```typescript
QUERY_FUNCTION_ARN
THEORY_FUNCTION_ARN
PROFILE_FUNCTION_ARN
CONVERSATION_MEMORY_TABLE
MODEL_ID
```

### Query Agent
```typescript
KNOWLEDGE_BASE_BUCKET
SCRIPT_DATA_BUCKET
EPISODE_CONFIG_TABLE
MAX_EMBEDDINGS_TO_LOAD
MODEL_ID
```

### Theory Agent
```typescript
QUERY_FUNCTION_ARN
USER_PROFILES_TABLE
CONVERSATION_MEMORY_TABLE
MODEL_ID
```

### Profile Agent
```typescript
USER_PROFILES_TABLE
FRAGMENT_GROUPS_TABLE
EPISODE_CONFIG_TABLE
MODEL_ID
```

---

## Cost Optimization

IAM permissions are configured to support cost optimization:

1. **Read-only access** where possible to reduce DynamoDB write costs
2. **Explicit CloudWatch Logs retention** (7 days) to reduce storage costs
3. **No OpenSearch Serverless** - using S3-based embeddings instead
4. **Lambda-based agents** - no managed Bedrock Agent costs
5. **On-demand DynamoDB billing** - no provisioned capacity costs

---

## Monitoring and Auditing

All IAM permissions support comprehensive monitoring:

1. **CloudWatch Logs** - All tool invocations and routing decisions logged
2. **X-Ray Tracing** - Can be enabled for distributed tracing
3. **CloudWatch Metrics** - Lambda execution metrics automatically collected
4. **Cost Explorer** - Track costs by Lambda function and service

---

## Deployment

IAM permissions are managed through AWS CDK in `infrastructure/lib/agent-stack.ts`:

```bash
cd infrastructure
pnpm run synth  # Review CloudFormation template
pnpm run deploy # Deploy with IAM changes
```

CDK automatically creates IAM roles and policies for each Lambda function with the permissions defined in this document.

---

## Requirements Validation

This IAM configuration satisfies the following requirements:

- **Requirement 6.2**: Tools have access to required resources (S3, DynamoDB)
- **Requirement 6.3**: Tools can invoke Bedrock models for inference
- **Requirement 7.4**: Identity context is available (via DynamoDB access)
- **Requirement 9.3**: User data isolation enforced (scoped DynamoDB access)
- **Requirement 10.3**: Policy enforcement supported (via Gateway permissions)
- **Requirement 11.1**: Memory service has DynamoDB access
- **Requirement 14.1**: All tool invocations can be logged (CloudWatch Logs)

---

## Future Enhancements

Potential IAM permission enhancements for future features:

1. **S3 Write Access** - For caching search results or storing generated content
2. **SQS Access** - For asynchronous agent communication
3. **EventBridge Access** - For event-driven workflows
4. **Secrets Manager** - For API keys or external service credentials
5. **Parameter Store** - For dynamic configuration management

These would be added incrementally as features are implemented, maintaining the principle of least privilege.
