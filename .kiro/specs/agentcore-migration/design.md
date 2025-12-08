# AgentCore Migration Design Document

## Overview

This design document describes the migration from **Bedrock Agents** (AWS managed service) to **AgentCore** (AWS framework/SDK using Strands). This migration solves the critical issue where Bedrock Agents fail to reliably invoke tools, while maintaining the multi-agent architecture that provides optimal performance and cost efficiency.

### Problem Summary

**Bedrock Agents Issue**: The managed service uses autonomous tool selection that is unreliable:
- Query Agent doesn't invoke search tools despite explicit instructions
- Orchestrator routes to wrong agents
- Agents hallucinate information instead of using available tools
- Issue persists across models (Nova Pro, Gemma 3 27B)

**AgentCore Solution**: Framework gives us full control over orchestration logic:
- We write the code that decides when to invoke tools
- Deterministic, reliable tool invocation
- Maintains multi-agent architecture benefits
- Full visibility and debugging capability

### Key Benefits

1. **Reliability**: Deterministic tool invocation - no autonomous decisions
2. **Control**: We write the orchestration logic explicitly
3. **Debugging**: Full visibility into agent execution and tool calls
4. **Cost**: Lambda-based agents (no managed service costs)
5. **Architecture**: Maintains multi-agent design for optimal performance

## Architecture

### High-Level Architecture

```
User Query
    │
    ▼
Message Processor (Lambda)
    │
    ▼
Orchestrator Agent (AgentCore)
    │
    ├─ Explicit Classification Logic
    ├─ Deterministic Routing
    │
    ├──► Query Agent (AgentCore)
    │    ├─ ALWAYS invokes semantic search
    │    ├─ Formats citations
    │    └─ Returns structured results
    │
    ├──► Theory Agent (AgentCore)
    │    ├─ Analyzes theory
    │    ├─ Explicitly invokes Query Agent for evidence
    │    └─ Updates theory profiles
    │
    └──► Profile Agent (AgentCore)
         ├─ Explicitly invokes profile service
         ├─ CRUD operations
         └─ Returns profile data
```


### AgentCore vs Bedrock Agents Comparison

| Aspect | Bedrock Agents (Current) | AgentCore (Target) |
|--------|-------------------------|-------------------|
| **Tool Selection** | Autonomous (unreliable) | Explicit code (deterministic) |
| **Control** | AWS controls logic | Developer controls logic |
| **Debugging** | Limited visibility | Full code visibility |
| **Cost** | Managed service fees | Lambda execution only |
| **Flexibility** | Fixed patterns | Custom orchestration |
| **Reliability** | Unpredictable | Predictable |

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentCore Gateway                           │
│  - Entry point for all requests                                  │
│  - Routes to appropriate agent                                   │
│  - Manages user identity and sessions                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentCore Identity & Policy                   │
│  - User authentication and authorization                         │
│  - Multi-user isolation                                          │
│  - Access control policies                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentCore Memory                            │
│  - Conversation history per user                                 │
│  - Session management                                            │
│  - Context retrieval                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Agent (AgentCore)                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Classification Logic (Explicit Code)                    │   │
│  │  - Keyword matching                                      │   │
│  │  - Pattern recognition                                   │   │
│  │  - Deterministic routing                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Sub-Agent Invocation (AgentCore)                        │   │
│  │  - Invoke Query Agent (sub-agent)                        │   │
│  │  - Invoke Theory Agent (sub-agent)                       │   │
│  │  - Invoke Profile Agent (sub-agent)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Specialized Agents (Sub-Agents)                 │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Query Agent (Sub-Agent)                                 │   │
│  │  - Tools: Semantic Search                                │   │
│  │  - Explicit tool invocation                              │   │
│  │  - Citation formatting                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Theory Agent (Sub-Agent)                                │   │
│  │  - Sub-Agents: Query Agent                               │   │
│  │  - Theory analysis logic                                 │   │
│  │  - Profile updates                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Profile Agent (Sub-Agent)                               │   │
│  │  │  Tools: Profile Service                               │   │
│  │  - CRUD operations                                       │   │
│  │  - User isolation                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Tools & Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Semantic     │  │ Profile      │  │ DynamoDB     │          │
│  │ Search Tool  │  │ Service Tool │  │ (Profiles)   │          │
│  │ (S3+Vectors) │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```


## AgentCore Framework Components

### AgentCore Gateway

**Purpose**: Entry point for all agent requests, handles routing and session management

**Responsibilities**:
- Receive requests from Message Processor
- Route to Orchestrator Agent
- Manage WebSocket streaming
- Handle errors and retries

### AgentCore Identity

**Purpose**: Manage user identity and authentication for multi-user support

**Responsibilities**:
- Authenticate users (integrate with Cognito)
- Maintain user context across requests
- Ensure user isolation (userId scoping)
- Pass identity to agents for access control

**Implementation**:
```typescript
interface UserIdentity {
  userId: string;
  username: string;
  groups: string[];
  attributes: Record<string, string>;
}

// Identity is passed to all agents
const identity = {
  userId: 'user-123',
  username: 'nick',
  groups: ['users'],
  attributes: {}
};
```

### AgentCore Policy

**Purpose**: Control access and permissions for multi-user environment

**Responsibilities**:
- Enforce user data isolation
- Control which agents users can access
- Manage resource permissions
- Audit access attempts

**Implementation**:
```typescript
interface AgentPolicy {
  allowedAgents: string[];
  dataIsolation: 'strict' | 'shared';
  maxTokens: number;
  rateLimit: number;
}

// Policy per user
const userPolicy = {
  allowedAgents: ['orchestrator', 'query', 'theory', 'profile'],
  dataIsolation: 'strict',  // Users only see their own data
  maxTokens: 2048,
  rateLimit: 100  // requests per hour
};
```

### AgentCore Memory

**Purpose**: Manage conversation history and context for each user

**Responsibilities**:
- Store conversation history per user/session
- Retrieve relevant context for queries
- Compact old conversations
- Maintain session state

**Implementation**:
```typescript
interface ConversationMemory {
  userId: string;
  sessionId: string;
  messages: Message[];
  summary?: string;
  lastAccessed: Date;
}

// Memory is automatically managed by AgentCore
// Agents can access conversation history
const memory = await agentCore.memory.getSession(userId, sessionId);
```

## Detailed Component Design

### 1. Orchestrator Agent (AgentCore)

**Purpose**: Central coordinator with explicit routing logic

**Implementation Approach**:

```typescript
import { Agent, SubAgent } from '@aws/strands-sdk';

class OrchestratorAgent extends Agent {
  constructor() {
    super({
      name: 'CICADA-Orchestrator',
      description: 'Central coordinator for CICADA multi-agent system',
      modelId: 'amazon.nova-pro-v1:0'
    });
    
    // Register specialized agents as sub-agents (not tools)
    this.registerSubAgent('query', {
      agentId: 'CICADA-Query',
      description: 'Script search and citation specialist'
    });
    
    this.registerSubAgent('theory', {
      agentId: 'CICADA-Theory',
      description: 'Theory analysis specialist'
    });
    
    this.registerSubAgent('profile', {
      agentId: 'CICADA-Profile',
      description: 'Profile management specialist'
    });
  }
  
  async processQuery(
    query: string, 
    identity: UserIdentity, 
    memory: ConversationMemory
  ): Promise<string> {
    // Explicit classification logic (no LLM decision)
    const queryType = this.classifyQuery(query);
    
    logger.info('Query classified', {
      query: query.substring(0, 50),
      queryType,
      userId: identity.userId
    });
    
    // Deterministic routing based on classification
    // Invoke sub-agent with identity and memory context
    switch (queryType) {
      case 'SCRIPT_QUERY':
        return await this.invokeSubAgent('query', {
          query,
          identity,
          memory
        });
        
      case 'THEORY_REQUEST':
        return await this.invokeSubAgent('theory', {
          query,
          identity,
          memory
        });
        
      case 'PROFILE_REQUEST':
        return await this.invokeSubAgent('profile', {
          query,
          identity,
          memory
        });
        
      default:
        // Default to Query Agent for general questions
        return await this.invokeSubAgent('query', {
          query,
          identity,
          memory
        });
    }
  }
  
  private classifyQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    // Profile request patterns
    if (lowerQuery.includes('show me') || 
        lowerQuery.includes('list') ||
        lowerQuery.includes('my profile') ||
        lowerQuery.includes('update profile')) {
      return 'PROFILE_REQUEST';
    }
    
    // Theory request patterns
    if (lowerQuery.includes('theory') ||
        lowerQuery.includes('hypothesis') ||
        lowerQuery.includes('evidence for') ||
        lowerQuery.includes('validate')) {
      return 'THEORY_REQUEST';
    }
    
    // Default to script query
    return 'SCRIPT_QUERY';
  }
}
```

**Key Design Decisions**:
- **Sub-agents not tools**: Query/Theory/Profile are registered as sub-agents
- **Explicit classification**: Simple keyword matching, no LLM decision
- **Deterministic routing**: Switch statement, not autonomous agent choice
- **Identity propagation**: UserIdentity passed to all sub-agents for isolation
- **Memory context**: Conversation history available to all agents
- **Logging**: Every routing decision logged for debugging


### 2. Query Agent (AgentCore)

**Purpose**: Script search specialist with deterministic tool invocation

**Implementation Approach**:

```typescript
import { Agent, Tool } from '@aws/strands-sdk';
import { semanticSearch } from '../services/knowledge-base-service';

class QueryAgent extends Agent {
  constructor() {
    super({
      name: 'CICADA-Query',
      description: 'Script search and citation specialist',
      modelId: 'amazon.nova-pro-v1:0'
    });
    
    // Register search tool
    this.registerTool(new SemanticSearchTool());
  }
  
  async invoke(params: { 
    query: string; 
    identity: UserIdentity; 
    memory: ConversationMemory 
  }): Promise<string> {
    const { query, identity, memory } = params;
    
    logger.info('Query Agent invoked', { 
      query: query.substring(0, 50), 
      userId: identity.userId 
    });
    
    // ALWAYS invoke semantic search (no autonomous decision)
    const searchResults = await this.tools.semanticSearch.execute({
      query,
      topK: 20,
      minScore: 0.5,
      maxEmbeddingsToLoad: 3000
    });
    
    logger.info('Search completed', {
      resultCount: searchResults.length,
      topScore: searchResults[0]?.score
    });
    
    // Format context with citations
    const context = this.formatSearchResults(searchResults);
    
    // Build prompt with explicit instructions
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `${context}\n\nUser question: ${query}\n\n` +
      `Based on the script passages above, answer the question with citations.`;
    
    // Invoke LLM with context
    const response = await this.generateResponse({
      system: systemPrompt,
      user: userPrompt
    });
    
    return response;
  }
  
  private formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No relevant passages found in the script for this query.';
    }
    
    let context = 'Here are relevant passages from the Higurashi script:\n\n';
    
    results.slice(0, 10).forEach((result, idx) => {
      context += `[${idx + 1}] Episode: ${result.episodeName}, `;
      context += `Chapter: ${result.chapterId}, Message: ${result.messageId}\n`;
      
      if (result.speaker) {
        context += `Speaker: ${result.speaker}\n`;
      }
      
      context += `Text: ${result.textENG}\n`;
      context += `Relevance: ${(result.score * 100).toFixed(1)}%\n\n`;
    });
    
    return context;
  }
  
  private buildSystemPrompt(): string {
    return `You are CICADA's Query Agent, specialized in analyzing Higurashi script content.

Your responsibilities:
1. Base responses STRICTLY on provided script passages
2. Cite specific episodes, chapters, and speakers
3. If no passages are found, state so honestly - never hallucinate
4. Maintain episode boundaries - don't mix information from different arcs
5. Be conversational but accurate

Always ground your responses in the script evidence provided.`;
  }
}

// Tool definition
class SemanticSearchTool extends Tool {
  constructor() {
    super({
      name: 'semanticSearch',
      description: 'Search Higurashi script database using semantic similarity',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          topK: { type: 'number', description: 'Number of results to return' },
          minScore: { type: 'number', description: 'Minimum similarity score' },
          maxEmbeddingsToLoad: { type: 'number', description: 'Max embeddings to load' }
        },
        required: ['query']
      }
    });
  }
  
  async execute(params: any): Promise<SearchResult[]> {
    return await semanticSearch(params.query, {
      topK: params.topK || 20,
      minScore: params.minScore || 0.5,
      maxEmbeddingsToLoad: params.maxEmbeddingsToLoad || 3000
    });
  }
}
```

**Key Design Decisions**:
- **Deterministic search**: ALWAYS invokes semantic search, no decision logic
- **Explicit tool invocation**: Direct call to `this.tools.semanticSearch.execute()`
- **Context formatting**: Structured citations with episode/chapter/speaker
- **Clear instructions**: System prompt explicitly defines behavior
- **No hallucination**: If no results, explicitly state that


### 3. Theory Agent (AgentCore)

**Purpose**: Theory analysis specialist with explicit Query Agent invocation

**Implementation Approach**:

```typescript
import { Agent } from '@aws/strands-sdk';

class TheoryAgent extends Agent {
  private queryAgent: QueryAgent;
  
  constructor() {
    super({
      name: 'CICADA-Theory',
      description: 'Theory analysis and evidence gathering specialist',
      modelId: 'amazon.nova-pro-v1:0'
    });
    
    this.queryAgent = new QueryAgent();
  }
  
  async invoke(params: { query: string; userId: string; sessionId: string }): Promise<string> {
    const { query, userId, sessionId } = params;
    
    logger.info('Theory Agent invoked', { query: query.substring(0, 50), userId });
    
    // Parse theory from query
    const theory = this.extractTheory(query);
    
    // Explicitly invoke Query Agent to gather evidence
    logger.info('Gathering evidence via Query Agent');
    const evidence = await this.queryAgent.invoke({
      query: `Find evidence related to: ${theory}`,
      userId,
      sessionId
    });
    
    // Analyze theory against evidence
    const analysis = await this.analyzeTheory(theory, evidence);
    
    // Update theory profile
    await this.updateTheoryProfile(userId, theory, analysis);
    
    return analysis;
  }
  
  private extractTheory(query: string): string {
    // Extract theory statement from query
    // Simple implementation - can be enhanced
    return query.replace(/theory:|hypothesis:/gi, '').trim();
  }
  
  private async analyzeTheory(theory: string, evidence: string): Promise<string> {
    const systemPrompt = `You are CICADA's Theory Agent, specialized in analyzing theories about Higurashi.

Your responsibilities:
1. Evaluate theories against script evidence
2. Identify supporting and contradicting evidence
3. Suggest theory refinements
4. Propose related theories
5. Maintain intellectual honesty - acknowledge uncertainty

Provide thorough, evidence-based analysis.`;
    
    const userPrompt = `Theory: ${theory}\n\nEvidence:\n${evidence}\n\n` +
      `Analyze this theory against the evidence. Identify supporting and contradicting points.`;
    
    return await this.generateResponse({
      system: systemPrompt,
      user: userPrompt
    });
  }
  
  private async updateTheoryProfile(userId: string, theory: string, analysis: string): Promise<void> {
    // Update user's theory profile in DynamoDB
    logger.info('Updating theory profile', { userId, theory: theory.substring(0, 50) });
    
    // Implementation would call profile service
    // await profileService.updateTheoryProfile(userId, theory, analysis);
  }
}
```

**Key Design Decisions**:
- **Explicit Query Agent invocation**: Direct call, not autonomous decision
- **Evidence gathering**: Always gathers evidence before analysis
- **Profile updates**: Explicitly updates theory profiles
- **Structured workflow**: Parse theory → gather evidence → analyze → update profile


### 4. Profile Agent (AgentCore)

**Purpose**: Profile management specialist with explicit service invocation

**Implementation Approach**:

```typescript
import { Agent, Tool } from '@aws/strands-sdk';

class ProfileAgent extends Agent {
  constructor() {
    super({
      name: 'CICADA-Profile',
      description: 'Profile management specialist',
      modelId: 'amazon.nova-pro-v1:0'
    });
    
    // Register profile service tools
    this.registerTool(new GetProfileTool());
    this.registerTool(new UpdateProfileTool());
    this.registerTool(new ListProfilesTool());
  }
  
  async invoke(params: { query: string; userId: string; sessionId: string }): Promise<string> {
    const { query, userId, sessionId } = params;
    
    logger.info('Profile Agent invoked', { query: query.substring(0, 50), userId });
    
    // Determine operation type
    const operation = this.classifyProfileOperation(query);
    
    // Explicitly invoke appropriate tool
    switch (operation.type) {
      case 'GET':
        return await this.handleGetProfile(userId, operation.profileId);
        
      case 'UPDATE':
        return await this.handleUpdateProfile(userId, operation.profileId, operation.data);
        
      case 'LIST':
        return await this.handleListProfiles(userId, operation.profileType);
        
      default:
        return 'I can help you view, update, or list profiles. What would you like to do?';
    }
  }
  
  private classifyProfileOperation(query: string): any {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('show') || lowerQuery.includes('get') || lowerQuery.includes('view')) {
      return { type: 'GET', profileId: this.extractProfileId(query) };
    }
    
    if (lowerQuery.includes('update') || lowerQuery.includes('save') || lowerQuery.includes('edit')) {
      return { type: 'UPDATE', profileId: this.extractProfileId(query), data: {} };
    }
    
    if (lowerQuery.includes('list') || lowerQuery.includes('all')) {
      return { type: 'LIST', profileType: this.extractProfileType(query) };
    }
    
    return { type: 'UNKNOWN' };
  }
  
  private async handleGetProfile(userId: string, profileId: string): Promise<string> {
    logger.info('Getting profile', { userId, profileId });
    
    const profile = await this.tools.getProfile.execute({
      userId,
      profileId
    });
    
    return this.formatProfile(profile);
  }
  
  private async handleUpdateProfile(userId: string, profileId: string, data: any): Promise<string> {
    logger.info('Updating profile', { userId, profileId });
    
    await this.tools.updateProfile.execute({
      userId,
      profileId,
      data
    });
    
    return `Profile ${profileId} updated successfully.`;
  }
  
  private async handleListProfiles(userId: string, profileType?: string): Promise<string> {
    logger.info('Listing profiles', { userId, profileType });
    
    const profiles = await this.tools.listProfiles.execute({
      userId,
      profileType
    });
    
    return this.formatProfileList(profiles);
  }
  
  private extractProfileId(query: string): string {
    // Extract profile ID from query
    // Simple implementation - can be enhanced
    return 'profile-id';
  }
  
  private extractProfileType(query: string): string | undefined {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('character')) return 'CHARACTER';
    if (lowerQuery.includes('location')) return 'LOCATION';
    if (lowerQuery.includes('episode')) return 'EPISODE';
    if (lowerQuery.includes('theory')) return 'THEORY';
    
    return undefined;
  }
  
  private formatProfile(profile: any): string {
    // Format profile for display
    return JSON.stringify(profile, null, 2);
  }
  
  private formatProfileList(profiles: any[]): string {
    // Format profile list for display
    return profiles.map(p => `- ${p.profileId}: ${p.profileType}`).join('\n');
  }
}
```

**Key Design Decisions**:
- **Explicit operation classification**: Keyword-based, not LLM decision
- **Direct tool invocation**: Switch statement determines which tool to call
- **User isolation**: All operations scoped to userId
- **Structured responses**: Formatted output for user display


## Data Models

### Agent Configuration

```typescript
interface AgentConfig {
  name: string;
  description: string;
  modelId: string;
  tools?: Tool[];
  systemPrompt?: string;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  execute: (params: any) => Promise<any>;
}
```

### Agent Communication

```typescript
interface AgentInvocationParams {
  query: string;
  userId: string;
  sessionId: string;
  context?: Record<string, any>;
}

interface AgentResponse {
  content: string;
  metadata?: {
    toolsInvoked: string[];
    executionTime: number;
    tokensUsed: number;
  };
}
```

### Tool Schemas

```typescript
// Semantic Search Tool
interface SemanticSearchParams {
  query: string;
  topK?: number;
  minScore?: number;
  maxEmbeddingsToLoad?: number;
  episodeIds?: string[];
}

interface SearchResult {
  id: string;
  episodeId: string;
  episodeName: string;
  chapterId: string;
  messageId: number;
  speaker?: string;
  textENG: string;
  textJPN?: string;
  score: number;
  metadata: Record<string, any>;
}

// Profile Service Tools
interface GetProfileParams {
  userId: string;
  profileId: string;
}

interface UpdateProfileParams {
  userId: string;
  profileId: string;
  data: Record<string, any>;
}

interface ListProfilesParams {
  userId: string;
  profileType?: string;
}
```


## Infrastructure Changes

### CDK Stack Updates

**Current (Bedrock Agents)**:
```typescript
// infrastructure/lib/agent-stack.ts
import { BedrockAgent } from 'aws-cdk-lib/aws-bedrock';

const queryAgent = new BedrockAgent(this, 'QueryAgent', {
  agentName: 'CICADA-Query',
  foundationModel: 'amazon.nova-pro-v1:0',
  instruction: '...',
  actionGroups: [...]
});
```

**Target (AgentCore)**:
```typescript
// infrastructure/lib/agent-stack.ts
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

// Query Agent Lambda
const queryAgentFunction = new Function(this, 'QueryAgentFunction', {
  runtime: Runtime.NODEJS_20_X,
  handler: 'query-agent.handler',
  code: Code.fromAsset('packages/backend/dist/agents'),
  timeout: Duration.seconds(300),
  memorySize: 1024,
  environment: {
    KNOWLEDGE_BASE_BUCKET: knowledgeBaseBucket.bucketName,
    MODEL_ID: 'amazon.nova-pro-v1:0'
  }
});

// Grant permissions
knowledgeBaseBucket.grantRead(queryAgentFunction);

// Similar for Theory and Profile agents
const theoryAgentFunction = new Function(this, 'TheoryAgentFunction', { ... });
const profileAgentFunction = new Function(this, 'ProfileAgentFunction', { ... });

// Orchestrator Lambda
const orchestratorFunction = new Function(this, 'OrchestratorFunction', {
  runtime: Runtime.NODEJS_20_X,
  handler: 'orchestrator.handler',
  code: Code.fromAsset('packages/backend/dist/agents'),
  timeout: Duration.seconds(300),
  memorySize: 512,
  environment: {
    QUERY_AGENT_ARN: queryAgentFunction.functionArn,
    THEORY_AGENT_ARN: theoryAgentFunction.functionArn,
    PROFILE_AGENT_ARN: profileAgentFunction.functionArn,
    MODEL_ID: 'amazon.nova-pro-v1:0'
  }
});

// Grant orchestrator permission to invoke specialized agents
queryAgentFunction.grantInvoke(orchestratorFunction);
theoryAgentFunction.grantInvoke(orchestratorFunction);
profileAgentFunction.grantInvoke(orchestratorFunction);
```

### Lambda Handler Structure

```typescript
// packages/backend/src/agents/orchestrator/handler.ts
import { OrchestratorAgent } from './orchestrator-agent';

const orchestrator = new OrchestratorAgent();

export const handler = async (event: any) => {
  const { query, userId, sessionId } = event;
  
  try {
    const response = await orchestrator.processQuery(query, userId, sessionId);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ response })
    };
  } catch (error) {
    logger.error('Orchestrator error', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal error' })
    };
  }
};
```


## Implementation Strategy

Since there is no production data and we can start fresh, we'll do a clean implementation:

### Phase 1: Remove Bedrock Agents

1. Remove all Bedrock Agent constructs from CDK (`infrastructure/lib/agent-stack.ts`)
2. Remove Bedrock Agent invocation code from Message Processor
3. Deploy to remove old resources

### Phase 2: Setup AgentCore Framework

1. Install Strands SDK: `pnpm add @aws/strands-sdk`
2. Create agent directory structure in `packages/backend/src/agents/`
3. Set up base classes and interfaces
4. Create Lambda handler templates

### Phase 3: Implement All Agents

1. Implement QueryAgent with deterministic search
2. Implement OrchestratorAgent with explicit routing
3. Implement TheoryAgent with Query Agent invocation
4. Implement ProfileAgent with profile service invocation
5. Implement all tool classes

### Phase 4: Update Infrastructure

1. Add Lambda functions for all agents to CDK
2. Configure IAM permissions
3. Update Message Processor to invoke Orchestrator
4. Deploy complete AgentCore stack

### Phase 5: Test and Validate

1. Run unit tests for all agents
2. Run integration tests for agent communication
3. Run property-based tests for reliability
4. Test end-to-end with real queries
5. Monitor costs and performance


## Error Handling

### Agent-Level Error Handling

```typescript
class QueryAgent extends Agent {
  async invoke(params: AgentInvocationParams): Promise<string> {
    try {
      // Attempt search
      const results = await this.tools.semanticSearch.execute({...});
      
      if (results.length === 0) {
        return 'I could not find any relevant information in the script for your query.';
      }
      
      return await this.generateResponse({...});
      
    } catch (error) {
      logger.error('Query Agent error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: params.query.substring(0, 50),
        userId: params.userId
      });
      
      // Return user-friendly error
      return 'I encountered an error searching the script. Please try again.';
    }
  }
}
```

### Tool-Level Error Handling

```typescript
class SemanticSearchTool extends Tool {
  async execute(params: SemanticSearchParams): Promise<SearchResult[]> {
    try {
      return await semanticSearch(params.query, {
        topK: params.topK || 20,
        minScore: params.minScore || 0.5,
        maxEmbeddingsToLoad: params.maxEmbeddingsToLoad || 3000
      });
    } catch (error) {
      logger.error('Semantic search tool error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params
      });
      
      // Return empty results on error
      return [];
    }
  }
}
```

### Orchestrator Error Handling

```typescript
class OrchestratorAgent extends Agent {
  async processQuery(query: string, userId: string, sessionId: string): Promise<string> {
    try {
      const queryType = this.classifyQuery(query);
      
      // Attempt to invoke appropriate agent
      switch (queryType) {
        case 'SCRIPT_QUERY':
          return await this.queryAgent.invoke({query, userId, sessionId});
        // ... other cases
      }
      
    } catch (error) {
      logger.error('Orchestrator error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: query.substring(0, 50),
        userId
      });
      
      // Fallback to Query Agent on error
      try {
        return await this.queryAgent.invoke({query, userId, sessionId});
      } catch (fallbackError) {
        return 'I encountered an error processing your request. Please try again.';
      }
    }
  }
}
```


## Testing Strategy

### Unit Testing

**Test Agent Logic**:
```typescript
describe('QueryAgent', () => {
  it('should always invoke semantic search', async () => {
    const agent = new QueryAgent();
    const searchSpy = jest.spyOn(agent.tools.semanticSearch, 'execute');
    
    await agent.invoke({
      query: 'Who is Rena?',
      userId: 'test-user',
      sessionId: 'test-session'
    });
    
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Who is Rena?'
      })
    );
  });
  
  it('should format citations correctly', async () => {
    const agent = new QueryAgent();
    const mockResults = [
      {
        episodeName: 'Onikakushi',
        chapterId: 'onikakushi_01',
        messageId: 100,
        speaker: 'Rena',
        textENG: 'Test text',
        score: 0.95
      }
    ];
    
    jest.spyOn(agent.tools.semanticSearch, 'execute').mockResolvedValue(mockResults);
    
    const response = await agent.invoke({
      query: 'Test query',
      userId: 'test-user',
      sessionId: 'test-session'
    });
    
    expect(response).toContain('Onikakushi');
    expect(response).toContain('onikakushi_01');
    expect(response).toContain('Rena');
  });
});
```

**Test Orchestrator Routing**:
```typescript
describe('OrchestratorAgent', () => {
  it('should route script queries to Query Agent', async () => {
    const orchestrator = new OrchestratorAgent();
    const querySpy = jest.spyOn(orchestrator.queryAgent, 'invoke');
    
    await orchestrator.processQuery(
      'Who is Rena?',
      'test-user',
      'test-session'
    );
    
    expect(querySpy).toHaveBeenCalledTimes(1);
  });
  
  it('should route profile requests to Profile Agent', async () => {
    const orchestrator = new OrchestratorAgent();
    const profileSpy = jest.spyOn(orchestrator.profileAgent, 'invoke');
    
    await orchestrator.processQuery(
      'Show me my character profiles',
      'test-user',
      'test-session'
    );
    
    expect(profileSpy).toHaveBeenCalledTimes(1);
  });
  
  it('should route theory requests to Theory Agent', async () => {
    const orchestrator = new OrchestratorAgent();
    const theorySpy = jest.spyOn(orchestrator.theoryAgent, 'invoke');
    
    await orchestrator.processQuery(
      'Analyze this theory: Rena is suspicious',
      'test-user',
      'test-session'
    );
    
    expect(theorySpy).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Testing

**Test End-to-End Flow**:
```typescript
describe('AgentCore Integration', () => {
  it('should complete full query flow', async () => {
    const orchestrator = new OrchestratorAgent();
    
    const response = await orchestrator.processQuery(
      'What does Rena say about Oyashiro-sama?',
      'test-user',
      'test-session'
    );
    
    expect(response).toBeTruthy();
    expect(response).toContain('Episode:');
    expect(response.length).toBeGreaterThan(50);
  });
  
  it('should handle Theory Agent invoking Query Agent', async () => {
    const theoryAgent = new TheoryAgent();
    
    const response = await theoryAgent.invoke({
      query: 'Theory: Rena knows about the curse',
      userId: 'test-user',
      sessionId: 'test-session'
    });
    
    expect(response).toBeTruthy();
    expect(response).toContain('evidence');
  });
});
```

### Property-Based Testing

**Test Tool Invocation Reliability**:
```typescript
import fc from 'fast-check';

describe('Query Agent Properties', () => {
  it('should always invoke search for any query', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (query) => {
          const agent = new QueryAgent();
          const searchSpy = jest.spyOn(agent.tools.semanticSearch, 'execute');
          
          await agent.invoke({
            query,
            userId: 'test-user',
            sessionId: 'test-session'
          });
          
          // Property: Search is ALWAYS invoked
          expect(searchSpy).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
```


## Cost Analysis

### Current (Bedrock Agents)

```
Per Query:
- Orchestrator Agent invocation: $0.000033
- Query Agent invocation: $0.000093
- Total: ~$0.000126 per query

Monthly (100 queries):
- Agent invocations: ~$0.013
- Infrastructure: ~$10-30
- Total: ~$10-30/month
```

### Target (AgentCore)

```
Per Query:
- Orchestrator Lambda: 
  - Duration: ~500ms
  - Memory: 512MB
  - Cost: $0.0000008 (Lambda) + $0.000033 (Bedrock model)
  
- Query Agent Lambda:
  - Duration: ~2000ms (includes search)
  - Memory: 1024MB
  - Cost: $0.0000067 (Lambda) + $0.000093 (Bedrock model)
  
- Total: ~$0.000134 per query

Monthly (100 queries):
- Lambda + Model: ~$0.013
- Infrastructure: ~$10-30
- Total: ~$10-30/month
```

**Cost Comparison**: Nearly identical costs, but AgentCore provides:
- Full control over orchestration
- Deterministic tool invocation
- Better debugging capability
- No managed service overhead


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Deterministic Search Invocation
*For any* query processed by the Query Agent, the semantic search tool SHALL be invoked exactly once.
**Validates: Requirements 2.1, 2.2**

### Property 2: Search Results Formatting
*For any* search results returned, each result SHALL include episode name, chapter ID, message ID, and text.
**Validates: Requirements 2.3, 6.1**

### Property 3: No Hallucination on Empty Results
*For any* query that returns zero search results, the response SHALL explicitly state no information was found and SHALL NOT contain fabricated information.
**Validates: Requirements 2.4, 2.5**

### Property 4: Orchestrator Routing Consistency
*For any* query containing profile keywords, the Orchestrator SHALL route to the Profile Agent.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 5: Routing Decision Logging
*For any* routing decision made by the Orchestrator, the decision and reasoning SHALL be logged.
**Validates: Requirements 3.5, 10.2**

### Property 6: Profile Agent Functionality Preservation
*For any* profile operation (get, update, list), the Profile Agent SHALL perform the operation and return results.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 7: Profile Persistence
*For any* profile update operation, the changes SHALL be persisted to DynamoDB.
**Validates: Requirements 4.3**

### Property 8: Theory Agent Evidence Gathering
*For any* theory analysis request, the Theory Agent SHALL invoke the Query Agent to gather evidence.
**Validates: Requirements 5.2, 7.2**

### Property 9: Theory Status Updates
*For any* theory validation or refutation, the theory status SHALL be updated in the user's profile.
**Validates: Requirements 5.4**

### Property 10: Tool Invocation Execution
*For any* tool invocation, the tool SHALL execute and return results or an error.
**Validates: Requirements 6.4, 6.5**

### Property 11: Agent Communication Success
*For any* agent-to-agent invocation, the calling agent SHALL receive a response or error from the invoked agent.
**Validates: Requirements 7.1, 7.2, 7.4**

### Property 12: Context Propagation
*For any* agent-to-agent communication, the userId and sessionId SHALL be propagated to the invoked agent.
**Validates: Requirements 7.3**

### Property 13: WebSocket Format Compatibility
*For any* response sent to the client, it SHALL use the existing WebSocketResponse format.
**Validates: Requirements 8.2**

### Property 14: Error Handling Consistency
*For any* error that occurs, it SHALL be logged and a user-friendly message SHALL be returned.
**Validates: Requirements 8.3, 10.3**

### Property 15: Cost Efficiency
*For any* query processed, the total cost SHALL not exceed $0.001 per query.
**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

### Property 16: Tool Invocation Logging
*For any* tool invocation, the tool name, parameters, and result status SHALL be logged.
**Validates: Requirements 10.1**

### Property 17: Agent Execution Tracing
*For any* agent execution, the full execution trace SHALL be available for debugging.
**Validates: Requirements 10.4**

### Property 18: Query Agent Search Reliability
*For any* 100 test queries, the Query Agent SHALL invoke semantic search 100 times.
**Validates: Requirements 11.1**

### Property 19: Orchestrator Routing Accuracy
*For any* set of test queries with known types, the Orchestrator SHALL route 100% correctly.
**Validates: Requirements 11.2**

### Property 20: Response Time Performance
*For any* 100 queries, at least 90 SHALL complete in under 5 seconds.
**Validates: Requirements 11.5**

