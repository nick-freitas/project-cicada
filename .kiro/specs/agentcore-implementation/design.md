# AgentCore Implementation Design Document

## Overview

This document specifies the implementation of CICADA's multi-agent architecture using AWS AgentCore and the Strands SDK. The current prototype uses direct Bedrock API calls, but the proper architecture requires AgentCore for native multi-agent orchestration, streaming, and coordination capabilities.

### Key Design Goals

1. **Native Agent Platform**: Use AgentCore's built-in orchestration instead of manual coordination
2. **Strands SDK Integration**: Implement all agents using the TypeScript Strands SDK
3. **Streaming Support**: Leverage AgentCore's streaming capabilities for real-time responses
4. **Agent Coordination**: Enable proper agent-to-agent invocation patterns
5. **Cost Optimization**: Maintain operation within $100/month budget
6. **API Compatibility**: Preserve existing API contracts for seamless integration

## Architecture

### High-Level Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React)                            │
│                   WebSocket Connection                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WSS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Gateway WebSocket                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  WebSocket Handler (Lambda)                      │
│              - Manages connections                               │
│              - Routes to SQS                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SQS Message Queue                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Message Processor (Lambda)                      │
│              - Invokes Orchestrator Agent                        │
│              - Handles streaming                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ AgentCore Invocation
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT (AgentCore)                      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Agent Definition (Strands SDK)                        │     │
│  │  - Query intent analysis                               │     │
│  │  - Agent routing logic                                 │     │
│  │  - Response aggregation                                │     │
│  │  - Conversation context management                     │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Foundation Model: Nova Lite                                     │
│  Streaming: Enabled                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Agent-to-Agent Invocation
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ QUERY AGENT  │    │ THEORY AGENT │    │PROFILE AGENT │
│ (AgentCore)  │    │ (AgentCore)  │    │ (AgentCore)  │
│              │    │              │    │              │
│ - Semantic   │    │ - Theory     │    │ - Info       │
│   search     │    │   analysis   │    │   extraction │
│ - Citations  │    │ - Evidence   │    │ - Profile    │
│ - Nuances    │    │   gathering  │    │   updates    │
│              │    │ - Refinement │    │ - Retrieval  │
│              │    │              │    │              │
│ Nova Lite    │    │ Nova Lite    │    │ Nova Lite    │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supporting Services                           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Knowledge    │  │ Profile      │  │ Memory       │          │
│  │ Base         │  │ Service      │  │ Service      │          │
│  │ (S3+Bedrock) │  │ (DynamoDB)   │  │ (DynamoDB)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Communication Flow

1. **User Query** → WebSocket → Handler → SQS → Message Processor
2. **Message Processor** → Invokes Orchestrator Agent (AgentCore)
3. **Orchestrator Agent** → Analyzes intent, determines required agents
4. **Orchestrator Agent** → Invokes specialized agents via AgentCore
5. **Specialized Agents** → Process requests, access services
6. **Orchestrator Agent** → Aggregates responses, streams to client
7. **Message Processor** → Forwards stream chunks to WebSocket


## Components and Interfaces

### 1. Strands SDK Agent Structure

Each agent is implemented using the Strands SDK with the following structure:

```typescript
import { Agent, AgentConfig } from '@aws/strands-sdk';

// Agent configuration
const agentConfig: AgentConfig = {
  name: 'OrchestratorAgent',
  description: 'Central coordinator for CICADA multi-agent system',
  modelId: 'amazon.nova-lite-v1:0',
  streaming: true,
  instructions: `System prompt and instructions...`,
  tools: [
    // Tool definitions for agent capabilities
  ],
};

// Create agent instance
const orchestratorAgent = new Agent(agentConfig);

// Agent invocation
const response = await orchestratorAgent.invoke({
  input: userQuery,
  sessionId: sessionId,
  streaming: true,
});
```

### 2. Orchestrator Agent (AgentCore)

**Purpose**: Central coordinator that analyzes queries and routes to specialized agents

**Configuration**:
- **Model**: Nova Lite (cost-effective, sufficient for routing)
- **Streaming**: Enabled
- **Tools**: Agent invocation tools for Query, Theory, and Profile agents
- **Instructions**: Query intent analysis, agent coordination patterns

**Key Methods**:
```typescript
interface OrchestratorAgent {
  // Main invocation method
  invoke(request: OrchestratorRequest): Promise<OrchestratorResponse>;
  
  // Streaming invocation
  invokeStream(request: OrchestratorRequest): AsyncIterable<StreamChunk>;
  
  // Internal: Analyze query intent
  analyzeIntent(query: string, context: string): Promise<QueryIntent>;
  
  // Internal: Coordinate agent invocations
  coordinateAgents(intent: QueryIntent): Promise<AgentResult[]>;
}
```

**Agent Tools**:
- `invokeQueryAgent`: Tool to invoke Query Agent
- `invokeTheoryAgent`: Tool to invoke Theory Agent
- `invokeProfileAgent`: Tool to invoke Profile Agent


### 3. Query Agent (AgentCore)

**Purpose**: Semantic search over script data with citation and nuance analysis

**Configuration**:
- **Model**: Nova Lite
- **Streaming**: Enabled
- **Tools**: Knowledge Base search, citation formatting, nuance analysis
- **Instructions**: Episode boundary enforcement, citation completeness

**Key Methods**:
```typescript
interface QueryAgent {
  // Process query with semantic search
  processQuery(request: QueryAgentRequest): Promise<QueryAgentResponse>;
  
  // Search Knowledge Base
  searchKnowledgeBase(query: string, filters: SearchFilters): Promise<SearchResult[]>;
  
  // Format citations
  formatCitations(results: SearchResult[]): Citation[];
  
  // Analyze linguistic nuances
  analyzeNuances(results: SearchResult[]): Promise<NuanceAnalysis[]>;
}
```

**Agent Tools**:
- `searchKnowledgeBase`: Tool to perform semantic search
- `formatCitation`: Tool to format search results as citations
- `analyzeNuance`: Tool to compare Japanese/English text

### 4. Theory Agent (AgentCore)

**Purpose**: Theory analysis, evidence gathering, and refinement

**Configuration**:
- **Model**: Nova Lite
- **Streaming**: Enabled
- **Tools**: Query Agent invocation, profile access, theory analysis
- **Instructions**: Evidence-based analysis, profile correction patterns

**Key Methods**:
```typescript
interface TheoryAgent {
  // Analyze theory with evidence
  analyzeTheory(request: TheoryAgentRequest): Promise<TheoryAgentResponse>;
  
  // Gather evidence via Query Agent
  gatherEvidence(theoryDescription: string): Promise<GatheredEvidence>;
  
  // Generate refinement suggestions
  generateRefinements(analysis: TheoryAnalysis): Promise<TheoryRefinement[]>;
  
  // Identify profile corrections
  identifyCorrections(challenge: string): Promise<ProfileCorrection[]>;
}
```

**Agent Tools**:
- `invokeQueryAgent`: Tool to gather evidence
- `accessProfile`: Tool to retrieve profile data
- `updateProfile`: Tool to correct profile information


### 5. Profile Agent (AgentCore)

**Purpose**: Knowledge extraction and profile management

**Configuration**:
- **Model**: Nova Lite
- **Streaming**: Disabled (profile operations are transactional)
- **Tools**: Profile service access, information extraction
- **Instructions**: Entity extraction patterns, profile update logic

**Key Methods**:
```typescript
interface ProfileAgent {
  // Extract and update profiles
  extractAndUpdateProfiles(request: ProfileAgentRequest): Promise<ProfileAgentResponse>;
  
  // Retrieve profiles for context
  retrieveProfiles(request: ProfileRetrievalRequest): Promise<ProfileRetrievalResponse>;
  
  // Extract information from conversation
  extractInformation(context: string): Promise<ExtractedInformation[]>;
  
  // Update profile with new information
  updateProfile(profile: Profile, info: ExtractedInformation): Promise<Profile>;
}
```

**Agent Tools**:
- `extractEntity`: Tool to extract entity information
- `getProfile`: Tool to retrieve existing profile
- `createProfile`: Tool to create new profile
- `updateProfile`: Tool to update profile data

### 6. CDK Infrastructure for AgentCore

**Agent Stack** (`infrastructure/lib/agent-stack.ts`):

```typescript
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';

export class AgentStack extends cdk.Stack {
  public readonly orchestratorAgent: bedrock.CfnAgent;
  public readonly queryAgent: bedrock.CfnAgent;
  public readonly theoryAgent: bedrock.CfnAgent;
  public readonly profileAgent: bedrock.CfnAgent;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    // Create IAM role for agents
    const agentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
      ],
    });

    // Grant access to DynamoDB, S3, Knowledge Base
    props.userProfilesTable.grantReadWriteData(agentRole);
    props.knowledgeBaseBucket.grantRead(agentRole);

    // Create Orchestrator Agent
    this.orchestratorAgent = new bedrock.CfnAgent(this, 'OrchestratorAgent', {
      agentName: 'CICADA-Orchestrator',
      description: 'Central coordinator for CICADA multi-agent system',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getOrchestratorInstructions(),
      agentResourceRoleArn: agentRole.roleArn,
    });

    // Create Query Agent
    this.queryAgent = new bedrock.CfnAgent(this, 'QueryAgent', {
      agentName: 'CICADA-Query',
      description: 'Script search and citation specialist',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getQueryInstructions(),
      agentResourceRoleArn: agentRole.roleArn,
    });

    // Create Theory Agent
    this.theoryAgent = new bedrock.CfnAgent(this, 'TheoryAgent', {
      agentName: 'CICADA-Theory',
      description: 'Theory analysis and validation specialist',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getTheoryInstructions(),
      agentResourceRoleArn: agentRole.roleArn,
    });

    // Create Profile Agent
    this.profileAgent = new bedrock.CfnAgent(this, 'ProfileAgent', {
      agentName: 'CICADA-Profile',
      description: 'Knowledge extraction and profile management specialist',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getProfileInstructions(),
      agentResourceRoleArn: agentRole.roleArn,
    });

    // Configure agent-to-agent permissions
    this.configureAgentPermissions();
  }

  private configureAgentPermissions(): void {
    // Allow Orchestrator to invoke other agents
    // Allow Theory Agent to invoke Query Agent
    // Implementation details...
  }
}
```


### 7. Agent Invocation Patterns

**From Lambda to Agent**:
```typescript
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

// Invoke with streaming
const command = new InvokeAgentCommand({
  agentId: process.env.ORCHESTRATOR_AGENT_ID,
  agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
  sessionId: sessionId,
  inputText: userQuery,
  enableTrace: true,
});

const response = await client.send(command);

// Process streaming response
for await (const chunk of response.completion) {
  if (chunk.chunk?.bytes) {
    const text = new TextDecoder().decode(chunk.chunk.bytes);
    await sendToWebSocket(connectionId, text);
  }
}
```

**Agent-to-Agent Invocation** (via Tools):
```typescript
// In Orchestrator Agent's tool definition
const invokeQueryAgentTool = {
  name: 'invoke_query_agent',
  description: 'Invoke the Query Agent to search script data',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      episodeContext: { type: 'array', items: { type: 'string' } },
    },
    required: ['query'],
  },
  // Tool implementation invokes Query Agent via Bedrock Agent Runtime
};
```

### 8. Streaming Implementation

**Message Processor Lambda**:
```typescript
export async function processMessage(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    const { requestId, userId, query, sessionId, connectionId } = message;

    try {
      // Update request status
      await updateRequestStatus(requestId, 'processing');

      // Invoke Orchestrator Agent with streaming
      const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
      const command = new InvokeAgentCommand({
        agentId: process.env.ORCHESTRATOR_AGENT_ID,
        agentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID,
        sessionId: sessionId,
        inputText: query,
      });

      const response = await client.send(command);

      // Stream chunks to WebSocket
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const text = new TextDecoder().decode(chunk.chunk.bytes);
          
          // Store chunk for reconnection
          await storeResponseChunk(requestId, text);
          
          // Send to WebSocket
          await sendToWebSocket(connectionId, {
            requestId,
            type: 'chunk',
            content: text,
          });
        }
      }

      // Send completion marker
      await sendToWebSocket(connectionId, {
        requestId,
        type: 'complete',
      });

      // Update request status
      await updateRequestStatus(requestId, 'complete');

    } catch (error) {
      logger.error('Error processing message', { error, requestId });
      await sendToWebSocket(connectionId, {
        requestId,
        type: 'error',
        error: 'An error occurred processing your request',
      });
      await updateRequestStatus(requestId, 'error');
    }
  }
}
```


## Data Models

### Agent Request/Response Models

```typescript
// Orchestrator Agent
interface OrchestratorRequest {
  userId: string;
  query: string;
  sessionId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
}

interface OrchestratorResponse {
  content: string;
  citations?: Citation[];
  profileUpdates?: string[];
  agentsInvoked: string[];
}

// Query Agent
interface QueryAgentRequest {
  query: string;
  userId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
  characterFocus?: string;
}

interface QueryAgentResponse {
  content: string;
  citations: Citation[];
  hasDirectEvidence: boolean;
  nuanceAnalysis?: NuanceAnalysis[];
}

// Theory Agent
interface TheoryAgentRequest {
  userId: string;
  theoryName?: string;
  theoryDescription: string;
  userChallenge?: string;
  requestRefinement?: boolean;
  episodeContext?: string[];
}

interface TheoryAgentResponse {
  analysis: string;
  supportingEvidence: Citation[];
  contradictingEvidence: Citation[];
  refinementSuggestions?: TheoryRefinement[];
  profileUpdates: ProfileUpdate[];
  profileCorrections: ProfileCorrection[];
}

// Profile Agent
interface ProfileAgentRequest {
  userId: string;
  conversationContext: string;
  citations?: Citation[];
  extractionMode?: 'auto' | 'explicit';
}

interface ProfileAgentResponse {
  extractedInformation: ExtractedInformation[];
  updatedProfiles: string[];
  createdProfiles: string[];
}
```

### Agent Configuration Models

```typescript
interface AgentConfig {
  agentId: string;
  agentAliasId: string;
  agentName: string;
  foundationModel: string;
  streaming: boolean;
  instructions: string;
  tools: AgentTool[];
}

interface AgentTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: any) => Promise<any>;
}
```


## Error Handling

### Agent Invocation Errors

```typescript
class AgentInvocationError extends Error {
  constructor(
    message: string,
    public agentName: string,
    public retryable: boolean,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AgentInvocationError';
  }
}

async function invokeAgentWithRetry(
  agentId: string,
  input: any,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await invokeAgent(agentId, input);
    } catch (error) {
      lastError = error;
      
      if (!isRetryable(error) || attempt === maxRetries) {
        throw new AgentInvocationError(
          `Failed to invoke agent after ${attempt} attempts`,
          agentId,
          false,
          error
        );
      }
      
      // Exponential backoff
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  
  throw lastError!;
}
```

### Streaming Error Handling

```typescript
async function handleStreamingErrors(
  stream: AsyncIterable<any>,
  connectionId: string,
  requestId: string
): Promise<void> {
  try {
    for await (const chunk of stream) {
      await sendToWebSocket(connectionId, {
        requestId,
        type: 'chunk',
        content: chunk.text,
      });
    }
    
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'complete',
    });
  } catch (error) {
    logger.error('Streaming error', { error, requestId });
    
    await sendToWebSocket(connectionId, {
      requestId,
      type: 'error',
      error: 'Stream interrupted. Please try again.',
    });
    
    await updateRequestStatus(requestId, 'error');
  }
}
```


## Testing Strategy

### Unit Testing

**Agent Logic Testing**:
```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

describe('Orchestrator Agent', () => {
  const agentMock = mockClient(BedrockAgentRuntimeClient);

  beforeEach(() => {
    agentMock.reset();
  });

  it('should invoke Query Agent for script queries', async () => {
    agentMock.on(InvokeAgentCommand).resolves({
      completion: mockStreamingResponse('Query result...'),
    });

    const result = await invokeOrchestratorAgent({
      query: 'What does Rena say about...',
      userId: 'test-user',
      sessionId: 'test-session',
    });

    expect(result.agentsInvoked).toContain('query');
  });
});
```

### Integration Testing

**End-to-End Agent Flow**:
```typescript
describe('Agent Integration', () => {
  it('should coordinate multiple agents', async () => {
    // Requires deployed AgentCore agents
    const orchestratorId = process.env.ORCHESTRATOR_AGENT_ID;
    
    if (!orchestratorId) {
      console.log('Skipping - agents not deployed');
      return;
    }

    const result = await invokeAgent(orchestratorId, {
      query: 'Analyze the theory that...',
      userId: 'test-user',
      sessionId: 'test-session',
    });

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('citations');
  });
});
```

### Property-Based Testing

All existing property-based tests must continue to pass with AgentCore implementation:

```typescript
describe('Property: Citation Completeness', () => {
  it('should include complete metadata in all citations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10 }),
        async (query) => {
          const result = await invokeQueryAgent({ query, userId: 'test' });
          
          // Property 8: Citation Completeness
          for (const citation of result.citations) {
            expect(citation).toHaveProperty('episodeId');
            expect(citation).toHaveProperty('episodeName');
            expect(citation).toHaveProperty('chapterId');
            expect(citation).toHaveProperty('messageId');
            expect(citation).toHaveProperty('textENG');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```


## Deployment Strategy

### Phase 1: Infrastructure Setup
1. Install Strands SDK and Bedrock Agent Runtime dependencies
2. Create CDK Agent Stack with agent definitions
3. Deploy agents to AWS (without connecting to application)
4. Verify agents can be invoked independently

### Phase 2: Orchestrator Implementation
1. Implement Orchestrator Agent with Strands SDK
2. Configure agent tools for invoking specialized agents
3. Update Message Processor to invoke Orchestrator via AgentCore
4. Test Orchestrator invocation and streaming

### Phase 3: Specialized Agents Implementation
1. Implement Query Agent with Strands SDK
2. Implement Theory Agent with Strands SDK
3. Implement Profile Agent with Strands SDK
4. Configure agent-to-agent invocation permissions
5. Test each agent independently

### Phase 4: Integration and Testing
1. Test full agent coordination flow
2. Verify all property-based tests pass
3. Run integration tests with deployed agents
4. Performance testing and optimization

### Phase 5: Cleanup
1. Remove old Bedrock-direct implementation
2. Update documentation
3. Deploy to nonprod environment
4. Monitor and validate


## Cost Analysis

### AgentCore Pricing Model

**Agent Invocation Costs**:
- Base invocation: Included in Bedrock model pricing
- Agent orchestration: No additional charge
- Agent-to-agent calls: Counted as separate model invocations

**Estimated Monthly Costs** (100 queries/month):

```
Per Query with Multi-Agent Coordination:

Orchestrator Agent:
- Input: 50 (query) + 300 (system) + 200 (context) = 550 tokens
- Output: 50 tokens (routing + coordination)
- Cost: (550 * $0.06 + 50 * $0.24) / 1M = $0.000045

Query Agent (invoked 80% of queries):
- Input: 50 (query) + 400 (system) + 300 (citations) = 750 tokens
- Output: 200 tokens
- Cost: (750 * $0.06 + 200 * $0.24) / 1M = $0.000093

Theory Agent (invoked 30% of queries):
- Input: 50 (query) + 400 (system) + 200 (profiles) = 650 tokens
- Output: 300 tokens
- Cost: (650 * $0.06 + 300 * $0.24) / 1M = $0.000111

Profile Agent (invoked 100% of queries):
- Input: 50 (query) + 300 (system) + 100 (context) = 450 tokens
- Output: 100 tokens
- Cost: (450 * $0.06 + 100 * $0.24) / 1M = $0.000051

Average per query: $0.000300
Monthly (100 queries): $0.03

Total Infrastructure: ~$10-30/month
Total with AgentCore: ~$10-30/month (no additional cost)
```

**Cost Optimization Strategies**:
1. Use Nova Lite/Micro for all agents (most cost-effective)
2. Implement context compaction to reduce token usage
3. Cache agent responses where appropriate
4. Monitor and optimize agent invocation patterns
5. Use streaming to provide faster perceived response times


## Monitoring and Observability

### CloudWatch Metrics

**Agent-Specific Metrics**:
- `AgentInvocationCount`: Number of times each agent is invoked
- `AgentInvocationDuration`: Time taken for agent invocations
- `AgentInvocationErrors`: Number of failed agent invocations
- `AgentTokenUsage`: Tokens consumed per agent
- `AgentCoordinationLatency`: Time for multi-agent coordination

**Dashboard Configuration**:
```typescript
const agentDashboard = new cloudwatch.Dashboard(this, 'AgentDashboard', {
  dashboardName: 'CICADA-Agents',
  widgets: [
    [
      new cloudwatch.GraphWidget({
        title: 'Agent Invocations',
        left: [
          orchestratorInvocations,
          queryInvocations,
          theoryInvocations,
          profileInvocations,
        ],
      }),
    ],
    [
      new cloudwatch.GraphWidget({
        title: 'Agent Latency',
        left: [
          orchestratorLatency,
          queryLatency,
          theoryLatency,
          profileLatency,
        ],
      }),
    ],
    [
      new cloudwatch.GraphWidget({
        title: 'Token Usage by Agent',
        left: [
          orchestratorTokens,
          queryTokens,
          theoryTokens,
          profileTokens,
        ],
      }),
    ],
  ],
});
```

### Logging Strategy

**Structured Logging**:
```typescript
logger.info('Agent invocation started', {
  agentName: 'Orchestrator',
  userId: request.userId,
  sessionId: request.sessionId,
  queryLength: request.query.length,
  timestamp: new Date().toISOString(),
});

logger.info('Agent coordination', {
  agentName: 'Orchestrator',
  intent: intent.primaryIntent,
  agentsToInvoke: intent.agentsNeeded,
  episodeContext: request.episodeContext,
});

logger.info('Agent invocation completed', {
  agentName: 'Orchestrator',
  duration: Date.now() - startTime,
  agentsInvoked: result.agentsInvoked.length,
  citationCount: result.citations?.length || 0,
  tokenUsage: {
    input: inputTokens,
    output: outputTokens,
  },
});
```

### Tracing

**X-Ray Integration**:
- Enable X-Ray tracing for all agent invocations
- Track agent-to-agent call chains
- Identify performance bottlenecks
- Monitor error rates and patterns


## Security Considerations

### IAM Permissions

**Agent Execution Role**:
```typescript
const agentRole = new iam.Role(this, 'AgentRole', {
  assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
  inlinePolicies: {
    AgentPolicy: new iam.PolicyDocument({
      statements: [
        // Bedrock model access
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: ['arn:aws:bedrock:*::foundation-model/amazon.nova-*'],
        }),
        // DynamoDB access
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
          resources: [userProfilesTable.tableArn, conversationMemoryTable.tableArn],
        }),
        // S3 Knowledge Base access
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [`${knowledgeBaseBucket.bucketArn}/*`],
        }),
        // Agent-to-agent invocation
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeAgent'],
          resources: ['arn:aws:bedrock:*:*:agent/*'],
        }),
      ],
    }),
  },
});
```

### Data Isolation

- **User-Scoped Access**: All profile and memory access filtered by userId
- **Session Isolation**: Each session maintains separate context
- **Agent Permissions**: Agents can only access data they need
- **Encryption**: All data encrypted at rest and in transit

### Input Validation

```typescript
function validateAgentInput(input: any): void {
  // Validate required fields
  if (!input.userId || !input.query) {
    throw new ValidationError('Missing required fields');
  }
  
  // Sanitize input
  input.query = sanitizeInput(input.query);
  
  // Validate length limits
  if (input.query.length > 10000) {
    throw new ValidationError('Query too long');
  }
  
  // Validate episode context
  if (input.episodeContext) {
    input.episodeContext = input.episodeContext.filter(isValidEpisodeId);
  }
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Agent Invocation Consistency
*For any* valid agent request, invoking the agent through AgentCore should produce the same logical result as the prototype Bedrock-direct implementation
**Validates: Requirements 9.1, 9.2**

### Property 2: Streaming Completeness
*For any* agent response, the concatenation of all streamed chunks should equal the complete response that would be returned in non-streaming mode
**Validates: Requirements 8.1, 8.2**

### Property 3: Agent Coordination Correctness
*For any* query requiring multiple agents, the Orchestrator should invoke exactly the agents needed based on the query intent, no more and no less
**Validates: Requirements 2.2, 2.3**

### Property 4: Citation Preservation
*For any* query processed by the Query Agent, all citations in the AgentCore implementation should match the citations from the prototype implementation
**Validates: Requirements 3.4, 9.3**

### Property 5: Profile Update Consistency
*For any* conversation processed by the Profile Agent, profile updates should be identical whether using AgentCore or the prototype implementation
**Validates: Requirements 5.3, 5.4, 9.4**

### Property 6: Error Recovery
*For any* agent invocation that fails, the system should handle the error gracefully and provide a meaningful error message without exposing internal details
**Validates: Requirements 7.3**

### Property 7: Cost Efficiency
*For any* set of 100 queries, the total token usage with AgentCore should not exceed 110% of the prototype implementation's token usage
**Validates: Requirements 15.1, 15.2**

### Property 8: Response Time Consistency
*For any* query, the time to first chunk with AgentCore streaming should be less than or equal to the prototype implementation
**Validates: Requirements 8.1, 8.5**

