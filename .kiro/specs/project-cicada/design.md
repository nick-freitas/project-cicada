# CICADA Design Document

## Overview

CICADA (Contextual Inference & Comprehensive Analysis Data Agent) is a sophisticated multi-agent AI system for analyzing the visual novel "Higurashi no Naku Koro Ni". The system enables users to explore the complex narrative through natural conversation, build knowledge over time through user-specific profiles, and develop theories collaboratively with specialized AI agents.

The architecture follows a serverless, event-driven design on AWS, leveraging AgentCore for multi-agent orchestration, Bedrock for AI inference, and a React frontend for user interaction. The system maintains strict episode boundaries to prevent mixing contradictory information from different story fragments while supporting cross-episode analysis when explicitly requested.

### Key Features

- **Multi-Agent Architecture**: Orchestrator coordinates specialized agents (Query, Theory, Profile)
- **Real-Time Streaming**: WebSocket-based response streaming with reconnection handling
- **User-Specific Profiles**: Character, Location, Episode, Fragment Group, and Theory profiles
- **Episode Boundary Enforcement**: Prevents mixing contradictory information across fragments
- **Linguistic Nuance Analysis**: Compares Japanese and English text for deeper insights
- **Cost-Optimized**: Designed to operate under $100/month budget

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Chat UI      │  │ Profile Mgmt │  │ Auth         │          │
│  │ (WebSocket)  │  │ Interface    │  │ (Cognito)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         React + Vite + React Router                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS/WSS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                           │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ REST API     │  │ WebSocket    │                            │
│  │ (Profiles)   │  │ API (Chat)   │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestration Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Step         │  │ EventBridge  │  │ SQS Queues   │          │
│  │ Functions    │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Layer (AgentCore)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Orchestrator Agent (CICADA Arbiter)                     │   │
│  │  - Routes queries to specialized agents                  │   │
│  │  - Coordinates multi-step workflows                      │   │
│  │  - Maintains conversation context                        │   │
│  │  - Aggregates responses                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Query Agent  │  │ Theory Agent │  │ Profile Agent│          │
│  │ - Script     │  │ - Theory     │  │ - Extract    │          │
│  │   search     │  │   analysis   │  │   info       │          │
│  │ - Citations  │  │ - Evidence   │  │ - Update     │          │
│  │ - Nuance     │  │   gathering  │  │   profiles   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data & AI Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Bedrock      │  │ Knowledge    │  │ DynamoDB     │          │
│  │ (Nova/       │  │ Base         │  │ (Profiles,   │          │
│  │ Maverick)    │  │ (S3+Vectors) │  │ Memory)      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow and Streaming Architecture

#### Message Flow Sequence

1. **User sends message** → Frontend generates unique `requestId` (UUID)
2. **WebSocket message** → API Gateway receives message with `requestId` and `connectionId`
3. **WebSocket Handler Lambda** → Stores request in DynamoDB with status "processing"
4. **SQS Queue** → Message queued with `requestId`, `userId`, `connectionId`, query
5. **Step Function** → Orchestrates multi-agent workflow
6. **Orchestrator Agent** → Analyzes query intent, routes to specialized agents
7. **Specialized Agents** → Process requests (Query/Theory/Profile agents)
8. **Orchestrator Agent** → Aggregates results, streams response chunks via WebSocket
9. **WebSocket API** → Sends chunks to client using `connectionId`
10. **Frontend** → Receives chunks, appends to message display
11. **Completion** → Final chunk sent, DynamoDB status updated to "complete"

#### Reconnection Handling

**Scenario**: WebSocket connection drops during response generation

1. **Detection**: Frontend detects connection loss
2. **Reconnection**: Frontend automatically reconnects to WebSocket API
3. **Resume**: Frontend sends resume request with `requestId`
4. **Retrieval**: Backend retrieves accumulated response from DynamoDB
5. **Delivery**: Backend sends remaining chunks or complete response
6. **Continuation**: User experience continues seamlessly


#### Streaming Implementation

```typescript
// Frontend sends message
const requestId = uuidv4();
websocket.send(JSON.stringify({
  action: 'sendMessage',
  requestId,
  message: userQuery
}));

// Orchestrator streams response chunks
async function streamResponse(connectionId: string, requestId: string) {
  const stream = await orchestratorAgent.invokeWithStream(query);
  
  for await (const chunk of stream) {
    // Store chunk in DynamoDB for reconnection
    await storeResponseChunk(requestId, chunk);
    
    // Send to client
    await apiGateway.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        requestId,
        type: 'chunk',
        content: chunk.text
      })
    });
  }
  
  // Send completion marker
  await apiGateway.postToConnection({
    ConnectionId: connectionId,
    Data: JSON.stringify({
      requestId,
      type: 'complete'
    })
  });
  
  // Update status
  await updateRequestStatus(requestId, 'complete');
}

// Frontend receives chunks with reconnection
websocket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'chunk') {
    appendToMessage(data.requestId, data.content);
  } else if (data.type === 'complete') {
    markMessageComplete(data.requestId);
  }
};

websocket.onclose = () => {
  // Attempt reconnection
  setTimeout(() => reconnectAndResume(), 1000);
};

function reconnectAndResume() {
  const newWebSocket = new WebSocket(WS_URL);
  newWebSocket.onopen = () => {
    // Request resume for pending requests
    pendingRequests.forEach(requestId => {
      newWebSocket.send(JSON.stringify({
        action: 'resume',
        requestId
      }));
    });
  };
}
```

### Multi-Agent Architecture

#### Agent Coordination Flow

```
User Query
    │
    ▼
Orchestrator Agent (CICADA Arbiter)
    │
    ├─ Analyzes query intent
    ├─ Determines required agents
    ├─ Maintains conversation context
    │
    ├──► Query Agent
    │    ├─ Search Knowledge Base
    │    ├─ Filter by episode
    │    ├─ Format citations
    │    └─ Analyze nuances
    │
    ├──► Theory Agent
    │    ├─ Analyze theory
    │    ├─ Gather evidence
    │    ├─ Suggest refinements
    │    └─ Propose connections
    │
    └──► Profile Agent
         ├─ Extract information
         ├─ Update profiles
         ├─ Retrieve context
         └─ Maintain isolation
    │
    ▼
Orchestrator aggregates results
    │
    ▼
Stream response to user
```

#### Agent Specialization

**Orchestrator Agent (CICADA Arbiter)**
- **Role**: Central coordinator and conversation manager
- **Responsibilities**:
  - Query intent classification
  - Agent routing and coordination
  - Context management across agents
  - Response aggregation and streaming
  - Conversation coherence
- **When Invoked**: Every user query

**Query Agent**
- **Role**: Script search and citation specialist
- **Responsibilities**:
  - Semantic search over Knowledge Base
  - Episode boundary enforcement
  - Citation formatting with complete metadata
  - Japanese/English nuance analysis
  - Result grouping by episode
- **When Invoked**: Queries requiring script evidence

**Theory Agent**
- **Role**: Theory analysis and development specialist
- **Responsibilities**:
  - Theory validation against evidence
  - Supporting/contradicting evidence gathering
  - Theory refinement suggestions
  - Pattern identification across episodes
  - Connection proposal
- **When Invoked**: Theory-related queries

**Profile Agent**
- **Role**: Knowledge extraction and profile management specialist
- **Responsibilities**:
  - Information extraction from conversations
  - Profile creation and updates
  - User-specific profile isolation
  - Profile retrieval for context
  - Cross-profile relationship management
- **When Invoked**: Every query (for context and updates)


### Key Architectural Decisions

1. **Multi-Agent Architecture**: Specialized agents for better optimization and parallel execution
2. **Serverless Architecture**: Lambda for compute to minimize costs and scale automatically
3. **Event-Driven Design**: EventBridge and SQS for decoupled, asynchronous processing
4. **WebSocket Streaming with Reconnection**: Real-time response delivery with fault tolerance
5. **Request Tracking**: DynamoDB-based tracking for reconnection and debugging
6. **User-Specific Profiles**: All profiles scoped to individual users to prevent cross-contamination
7. **Episode Boundary Enforcement**: Knowledge Base queries filter by episode context
8. **Cost-First Design**: All components selected for cost-effectiveness within $100/month budget

### Cost Analysis

**Assumptions:**
- Average query: 50 tokens input
- Average response: 500 tokens output
- Profile context: 200 tokens
- Script citations: 300 tokens
- Nova Lite pricing: $0.06/1M input tokens, $0.24/1M output tokens
- 100 queries/month (realistic for 3 users)

**Multi-Agent Cost Breakdown:**
```
Per Query (Orchestrator + 2 specialized agents average):

Orchestrator:
- Input: 50 (query) + 300 (system prompt) = 350 tokens
- Output: 50 tokens (routing decision)
- Cost: (350 * $0.06 + 50 * $0.24) / 1M = $0.000033

Query Agent:
- Input: 50 (query) + 300 (citations) + 400 (system prompt) = 750 tokens
- Output: 200 tokens
- Cost: (750 * $0.06 + 200 * $0.24) / 1M = $0.000093

Theory/Profile Agent:
- Input: 50 (query) + 200 (profile) + 200 (from Query Agent) + 400 (system prompt) = 850 tokens
- Output: 300 tokens
- Cost: (850 * $0.06 + 300 * $0.24) / 1M = $0.000123

Total per query: $0.000249
Monthly (100 queries): $0.025 (~$0.03)
```

**Infrastructure Costs:**
- Lambda: ~$1-2/month
- DynamoDB: ~$2-5/month
- S3 + Knowledge Base: ~$5-15/month
- API Gateway: ~$1-3/month
- CloudWatch: ~$1-2/month
- **Total: ~$10-30/month**

**Grand Total: ~$10-30/month** (well under $100 budget)

## Components and Interfaces

### Frontend Components

#### 1. Chat Interface
- **Purpose**: Primary user interaction with real-time streaming
- **Technology**: React with WebSocket client
- **Key Features**:
  - Real-time message streaming
  - Automatic reconnection handling
  - Citation display with episode/chapter/speaker
  - Linguistic nuance annotations
  - Conversation history
  - Request status tracking
- **Interface**: WebSocket connection to API Gateway

#### 2. Profile Management Interface
- **Purpose**: View and edit accumulated knowledge profiles
- **Technology**: React with REST API client
- **Sections**:
  - Character Profiles
  - Location Profiles
  - Episode Profiles
  - Fragment Group Profiles
  - Theory Profiles
- **Features**:
  - List all profiles by type
  - View profile details
  - Edit profile information
  - See profile evolution over time
- **Interface**: REST API calls to API Gateway

#### 3. Authentication
- **Purpose**: User login and session management
- **Technology**: AWS Amplify + Cognito
- **Features**:
  - User registration and login
  - Session management
  - JWT token handling
- **Interface**: Cognito User Pools


### Backend Components

#### 1. WebSocket Handler (Lambda)
- **Purpose**: Manage WebSocket connections and route messages
- **Responsibilities**:
  - Connection management (connect, disconnect)
  - Message routing to orchestration layer
  - Streaming response chunks back to client
  - Reconnection handling
- **Triggers**: API Gateway WebSocket events
- **Outputs**: Messages to SQS queue for agent processing

#### 2. Agent Orchestration (Step Functions)
- **Purpose**: Coordinate multi-agent workflows
- **Responsibilities**:
  - Invoke Orchestrator Agent
  - Coordinate specialized agent invocations
  - Handle agent failures and retries
  - Track workflow state
- **Triggers**: SQS messages from WebSocket handler
- **Outputs**: Invokes agent Lambda functions

#### 3. Orchestrator Agent (Lambda + Strands SDK)
- **Purpose**: Central coordinator and conversation manager
- **Responsibilities**:
  - Analyze query intent
  - Route to appropriate specialized agents
  - Coordinate multi-agent workflows
  - Maintain conversation context
  - Aggregate responses from specialized agents
  - Stream final response to user
- **Interfaces**:
  - Bedrock API for model inference
  - Invokes specialized agent Lambdas
  - DynamoDB for conversation memory
  - WebSocket API for streaming

#### 4. Query Agent (Lambda + Strands SDK)
- **Purpose**: Script search and citation specialist
- **Responsibilities**:
  - Perform semantic search over Knowledge Base
  - Enforce episode boundary filtering
  - Format citations with complete metadata
  - Analyze Japanese/English nuances
  - Group results by episode
- **Interfaces**:
  - Bedrock API for model inference
  - Knowledge Base for script retrieval
  - Returns structured results to Orchestrator

#### 5. Theory Agent (Lambda + Strands SDK)
- **Purpose**: Theory analysis and development specialist
- **Responsibilities**:
  - Analyze user-proposed theories
  - Gather supporting and contradicting evidence
  - Suggest theory refinements
  - Propose new theories based on patterns
  - Validate theories against script data
- **Interfaces**:
  - Bedrock API for model inference
  - Invokes Query Agent for evidence gathering
  - DynamoDB for theory profile access
  - Returns analysis to Orchestrator

#### 6. Profile Agent (Lambda + Strands SDK)
- **Purpose**: Knowledge extraction and profile management specialist
- **Responsibilities**:
  - Extract character/location/episode information
  - Create new profiles automatically
  - Update existing profiles with new information
  - Retrieve relevant profile data for queries
  - Maintain user-specific profile isolation
- **Interfaces**:
  - Bedrock API for model inference
  - DynamoDB for profile CRUD operations
  - Returns profile data to Orchestrator

#### 7. Knowledge Base Service (Lambda)
- **Purpose**: Semantic search over script data
- **Responsibilities**:
  - Query embedding generation
  - Vector similarity search
  - Episode filtering
  - Result ranking and grouping
- **Data Source**: S3 + Bedrock Knowledge Base
- **Interface**: Invoked by Query Agent

#### 8. Profile Service (Lambda)
- **Purpose**: CRUD operations for user profiles
- **Responsibilities**:
  - Create/read/update profiles
  - Profile versioning for migrations
  - User-scoped access control
- **Data Store**: DynamoDB
- **Interface**: REST API (frontend) and direct invocation (Profile Agent)

#### 9. Memory Service (Lambda)
- **Purpose**: Manage conversation context and long-term memory
- **Responsibilities**:
  - Store conversation history
  - Retrieve relevant past conversations
  - Context compaction and summarization
  - Theory persistence
- **Data Store**: DynamoDB
- **Interface**: Invoked by Orchestrator Agent

#### 10. Data Ingestion Pipeline (Lambda)
- **Purpose**: Process and index script JSON files
- **Responsibilities**:
  - Parse JSON script files
  - Extract episode metadata using configuration
  - Generate embeddings
  - Store in Knowledge Base
- **Trigger**: S3 upload events or manual invocation
- **Outputs**: Indexed data in Knowledge Base


### Data Stores

#### 1. DynamoDB Tables

**UserProfiles Table**
- Partition Key: `userId`
- Sort Key: `profileType#profileId` (e.g., `CHARACTER#rena`, `THEORY#theory-001`)
- Attributes: `profileData` (JSON), `version`, `createdAt`, `updatedAt`
- GSI: `profileType-index` for listing profiles by type
- Purpose: Store all user-specific profiles

**ConversationMemory Table**
- Partition Key: `userId`
- Sort Key: `sessionId#timestamp`
- Attributes: `messages` (JSON), `summary`, `compactedContext`
- TTL: Optional for old sessions
- Purpose: Store conversation history and context

**FragmentGroups Table**
- Partition Key: `userId`
- Sort Key: `groupId`
- Attributes: `episodeIds` (list), `groupData` (JSON)
- Purpose: Store user-defined fragment groupings

**EpisodeConfiguration Table**
- Partition Key: `episodeId`
- Attributes: `episodeName`, `filePattern`, `arcType`, `metadata`
- Purpose: Map file patterns to episode metadata

**RequestTracking Table**
- Partition Key: `requestId`
- Attributes:
  - `userId`: User who made the request
  - `connectionId`: WebSocket connection ID
  - `status`: "processing" | "complete" | "error"
  - `query`: Original user query
  - `responseChunks`: Array of response chunks
  - `fullResponse`: Complete accumulated response
  - `createdAt`: Timestamp
  - `completedAt`: Timestamp
- TTL: 24 hours after completion
- Purpose: Track requests for reconnection and debugging

#### 2. S3 Buckets

**Script Data Bucket**
- Purpose: Store raw JSON script files
- Structure: `/scripts/{episode}/{chapter}.json`
- Lifecycle: No expiration

**Knowledge Base Bucket**
- Purpose: Store processed script data and embeddings
- Managed by: Bedrock Knowledge Base
- Structure: Managed by Bedrock

**Frontend Bucket**
- Purpose: Host React application
- Distribution: CloudFront
- Lifecycle: No expiration

#### 3. Bedrock Knowledge Base
- Purpose: Semantic search over script content
- Embedding Model: Amazon Titan Embeddings
- Vector Store: S3 (native Bedrock KB integration)
- Metadata Filters: `episodeId`, `chapterId`, `messageId`, `speaker`
- Indexing: Automatic on data ingestion


## Data Models

### Script Data Model

```typescript
interface ScriptMessage {
  type: string;              // "MSGSET", etc.
  MessageID: number;
  TextJPN: string;
  TextENG: string;
  speaker?: string;          // Extracted from context
  episodeId: string;         // From configuration
  chapterId: string;         // From filename
}

interface EpisodeConfig {
  episodeId: string;
  episodeName: string;       // Human-readable name
  filePattern: string;       // e.g., "kageboushi_*", "fragment_k6_*"
  arcType: "question" | "answer" | "other";
  metadata?: Record<string, any>;
}
```

### Profile Data Models

```typescript
interface BaseProfile {
  profileId: string;
  profileType: "CHARACTER" | "LOCATION" | "EPISODE" | "FRAGMENT_GROUP" | "THEORY";
  userId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface CharacterProfile extends BaseProfile {
  profileType: "CHARACTER";
  characterName: string;
  appearances: {
    episodeId: string;
    notes: string;
    citations: Citation[];
  }[];
  relationships: {
    characterName: string;
    nature: string;
    evidence: Citation[];
  }[];
  traits: string[];
  knownFacts: {
    fact: string;
    evidence: Citation[];
  }[];
}

interface LocationProfile extends BaseProfile {
  profileType: "LOCATION";
  locationName: string;
  description: string;
  appearances: {
    episodeId: string;
    context: string;
    citations: Citation[];
  }[];
  significance: string;
}

interface EpisodeProfile extends BaseProfile {
  profileType: "EPISODE";
  episodeId: string;
  episodeName: string;
  summary: string;
  keyEvents: {
    event: string;
    citations: Citation[];
  }[];
  characters: string[];
  locations: string[];
  themes: string[];
}

interface FragmentGroupProfile extends BaseProfile {
  profileType: "FRAGMENT_GROUP";
  groupName: string;
  episodeIds: string[];
  sharedTimeline: string;
  connections: {
    description: string;
    evidence: Citation[];
  }[];
  divergences: {
    description: string;
    evidence: Citation[];
  }[];
}

interface TheoryProfile extends BaseProfile {
  profileType: "THEORY";
  theoryName: string;
  description: string;
  status: "proposed" | "supported" | "refuted" | "refined";
  supportingEvidence: Citation[];
  contradictingEvidence: Citation[];
  refinements: {
    timestamp: string;
    description: string;
    reasoning: string;
  }[];
  relatedTheories: string[];
}

interface Citation {
  episodeId: string;
  episodeName: string;
  chapterId: string;
  messageId: number;
  speaker?: string;
  textENG: string;
  textJPN?: string;
  nuance?: string;
}
```

### Memory Data Models

```typescript
interface ConversationSession {
  userId: string;
  sessionId: string;
  startedAt: string;
  messages: Message[];
  summary?: string;
  compactedContext?: string;
  activeEpisodeContext?: string[];  // Episodes being discussed
  activeFragmentGroup?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: Citation[];
  profileUpdates?: string[];  // Profile IDs that were updated
}

interface RequestTracking {
  requestId: string;
  userId: string;
  connectionId: string;
  status: "processing" | "complete" | "error";
  query: string;
  responseChunks: string[];
  fullResponse?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}
```


## Error Handling

### Error Categories

1. **User Input Errors**
   - Invalid episode names
   - Malformed queries
   - Response: Friendly error message with suggestions

2. **Data Retrieval Errors**
   - Knowledge Base unavailable
   - Profile not found
   - Response: Graceful degradation, use available data

3. **AI Model Errors**
   - Bedrock throttling
   - Model timeout
   - Response: Retry with exponential backoff, fallback to cached responses

4. **Infrastructure Errors**
   - Lambda timeout
   - DynamoDB throttling
   - WebSocket connection errors
   - Response: Queue for retry, notify user of delay

5. **Agent Coordination Errors**
   - Specialized agent failure
   - Response aggregation timeout
   - Response: Fallback to partial results, notify user

### Error Handling Strategy

```typescript
class CICADAError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean,
    public userMessage: string
  ) {
    super(message);
  }
}

// Orchestrator error handling
async function handleQuery(query: string): Promise<Response> {
  try {
    return await processQuery(query);
  } catch (error) {
    if (error instanceof CICADAError) {
      if (error.retryable) {
        await sendToRetryQueue(query);
      }
      return {
        error: true,
        message: error.userMessage
      };
    }
    logger.error("Unexpected error", error);
    return {
      error: true,
      message: "I encountered an unexpected issue. Please try again."
    };
  }
}

// WebSocket reconnection error handling
async function handleReconnection(requestId: string): Promise<void> {
  try {
    const request = await getRequestTracking(requestId);
    
    if (request.status === 'complete') {
      // Send complete response
      await sendCompleteResponse(request);
    } else if (request.status === 'processing') {
      // Send accumulated chunks and continue streaming
      await sendAccumulatedChunks(request);
      await continueStreaming(request);
    } else {
      throw new CICADAError(
        'Request in error state',
        'REQUEST_ERROR',
        false,
        'This request encountered an error. Please try again.'
      );
    }
  } catch (error) {
    logger.error('Reconnection failed', error);
    throw error;
  }
}
```

## Testing Strategy

### Unit Testing
- **Framework**: Jest
- **Coverage**: All Lambda functions, utility modules
- **Focus**:
  - Profile extraction logic
  - Episode filtering logic
  - Citation formatting
  - Error handling paths
  - Agent routing logic
  - Response aggregation

### Integration Testing
- **Framework**: Jest + AWS SDK mocks
- **Focus**:
  - Multi-agent workflow end-to-end
  - Knowledge Base queries
  - Profile CRUD operations
  - WebSocket message flow
  - Reconnection handling
  - Agent coordination

### Property-Based Testing
- **Framework**: fast-check (TypeScript PBT library)
- **Minimum Iterations**: 100 per property
- **Properties to Test**: (Defined in Correctness Properties section)

### End-to-End Testing
- **Framework**: Playwright
- **Focus**:
  - User authentication flow
  - Chat interaction with streaming
  - WebSocket reconnection
  - Profile viewing and editing
  - Multi-agent coordination

### Model Evaluation
- **Framework**: AWS Evals
- **Metrics**:
  - Citation accuracy: % of citations that match actual script
  - Theory coherence: Manual evaluation of theory quality
  - Story coherence: % of responses that correctly maintain episode boundaries
  - Overall correctness: User satisfaction ratings
  - Agent coordination: Success rate of multi-agent workflows


## Deployment Strategy

### Infrastructure as Code
- **Tool**: AWS CDK (TypeScript)
- **Stacks**:
  - `CICADADataStack`: S3, DynamoDB, Knowledge Base
  - `CICADAComputeStack`: Lambda functions, Step Functions
  - `CICADAAgentStack`: AgentCore agents (Orchestrator, Query, Theory, Profile)
  - `CICADAAPIStack`: API Gateway (REST + WebSocket)
  - `CICADAAuthStack`: Cognito User Pool
  - `CICADAFrontendStack`: S3 + CloudFront
  - `CICADAMonitoringStack`: CloudWatch alarms, dashboards

### Deployment Pipeline
1. Build frontend (Vite)
2. Synthesize CDK stacks
3. Deploy backend stacks (Data → Compute → Agent → API)
4. Run data ingestion
5. Deploy frontend to S3
6. Invalidate CloudFront cache
7. Run smoke tests

### Environment Management
- **Development**: Single AWS account, reduced resources
- **Production**: Same account, full resources (within budget)

## Cost Optimization Strategies

### Token Management
1. **Context Compaction**: Summarize old conversation turns
2. **Selective Profile Loading**: Only load relevant profiles
3. **Caching**: Cache frequent queries and responses
4. **Model Selection**: Use smaller models (Nova Micro/Lite) when appropriate
5. **Agent Coordination**: Minimize unnecessary agent invocations

### Infrastructure Optimization
1. **Lambda Memory**: Right-size based on actual usage
2. **DynamoDB**: On-demand pricing for variable workload
3. **S3**: Lifecycle policies for old data
4. **CloudWatch**: Selective logging, log retention policies
5. **WebSocket**: Connection timeout to prevent idle connections

### Monitoring
- **CloudWatch Alarm**: Daily cost > $3
- **Cost Dashboard**: Real-time cost tracking by service
- **Usage Metrics**: Track API calls, token usage, storage, agent invocations

## Security Considerations

### Authentication & Authorization
- Cognito User Pools for authentication
- JWT tokens for API authorization
- User-scoped data access (profiles, memory)
- WebSocket connection authentication

### Data Protection
- Encryption at rest (DynamoDB, S3)
- Encryption in transit (TLS)
- No PII in logs
- User data isolation

### API Security
- API Gateway throttling
- WAF rules for common attacks
- CORS configuration
- WebSocket connection limits

## Scalability Considerations

### Current Scale (3 users)
- Minimal infrastructure
- On-demand pricing
- No auto-scaling needed
- WebSocket connections: ~3 concurrent

### Future Scale (100+ users)
- DynamoDB auto-scaling
- Lambda reserved concurrency
- CloudFront caching
- WebSocket connection pooling
- Consider Aurora Serverless for profiles

## Migration Strategy

### Profile Schema Versioning
```typescript
interface ProfileMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (oldProfile: any) => any;
}

const migrations: ProfileMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (profile) => ({
      ...profile,
      newField: "default value"
    })
  }
];
```

### Migration Process
1. Deploy new code with migration logic
2. Run migration Lambda to update profiles
3. Verify data integrity
4. Update version number in profiles
5. Monitor for issues


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: JSON Parsing Completeness
*For any* valid script JSON file, when parsed, all required fields (MessageID, TextJPN, TextENG, type) SHALL be extracted without loss.
**Validates: Requirements 1.1**

### Property 2: Storage-Retrieval Round Trip
*For any* script data stored in S3, retrieving it SHALL return data equivalent to what was stored.
**Validates: Requirements 1.2**

### Property 3: Embedding Generation Completeness
*For any* stored script message, an embedding SHALL be generated and associated with that message.
**Validates: Requirements 1.3**

### Property 4: Episode Resolution Correctness
*For any* chapter filename and episode configuration, the resolved episode SHALL match the pattern defined in the configuration.
**Validates: Requirements 1.4, 2.3**

### Property 5: Configuration Storage Fidelity
*For any* episode configuration input, the stored configuration SHALL contain all specified fields (episode name, arc type, file patterns).
**Validates: Requirements 2.2**

### Property 6: Query Name Equivalence
*For any* episode, querying by file pattern or human-readable name SHALL return the same episode data.
**Validates: Requirements 2.5**

### Property 7: Episode Boundary Enforcement
*For any* query scoped to specific episodes, all returned passages SHALL belong only to those episodes.
**Validates: Requirements 3.2, 11.1, 11.3**

### Property 8: Citation Completeness
*For any* retrieved passage, the citation SHALL include episode name, chapter number, MessageID, speaker (if present), and full text.
**Validates: Requirements 3.4, 5.1, 5.2, 5.3**

### Property 9: Episode Grouping in Results
*For any* search returning passages from multiple episodes, results SHALL be grouped by episode.
**Validates: Requirements 3.5**

### Property 10: Inference Transparency
*For any* response without supporting citations, the response SHALL be explicitly marked as inference or speculation.
**Validates: Requirements 5.5**

### Property 11: Profile Correction Propagation
*For any* profile correction made during theory analysis, the updated profile SHALL be persisted and used in subsequent queries.
**Validates: Requirements 7.3**

### Property 12: Theory Citation Inclusion
*For any* theory suggestion, the suggestion SHALL include supporting citations from the script.
**Validates: Requirements 8.5**

### Property 13: Profile Update on Insight
*For any* new insight discovered during theory analysis, relevant profiles SHALL be updated with the new information.
**Validates: Requirements 8.3**

### Property 14: Fragment Group Episode Inclusion
*For any* query about an episode in a fragment group, information from all episodes in that group SHALL be considered contextually relevant.
**Validates: Requirements 9.2, 9.3, 10.3**

### Property 15: Fragment Group Scope Limiting
*For any* query specifying particular episodes or fragment groups, only those episodes SHALL be included in the analysis.
**Validates: Requirements 9.4**

### Property 16: Cross-Episode Attribution
*For any* information from multiple episodes in a response, each piece SHALL have clear episode attribution.
**Validates: Requirements 9.5, 10.5, 11.4**

### Property 17: Fragment Group Persistence
*For any* fragment group created, it SHALL be stored and retrievable in future sessions.
**Validates: Requirements 10.1, 10.2**

### Property 18: Fragment Group Update Propagation
*For any* modification to fragment groupings, subsequent queries SHALL use the updated groupings.
**Validates: Requirements 10.4**

### Property 19: Character-Focused Retrieval
*For any* query about a specific character, all retrieved passages SHALL feature that character.
**Validates: Requirements 11.2**

### Property 20: Character Instance Separation
*For any* character appearing in multiple episodes, information SHALL maintain episode context and not conflate fragment-specific details.
**Validates: Requirements 11.5**

### Property 21: Session Context Continuity
*For any* message within a session, the system SHALL have access to all previous messages in that session.
**Validates: Requirements 12.1**

### Property 22: Session Isolation
*For any* new session, it SHALL not have access to conversation context from previous sessions (except through explicit memory retrieval).
**Validates: Requirements 12.2**

### Property 23: Cross-Session Theory Recall
*For any* theory discussed in a previous session, when relevant to the current conversation, it SHALL be retrieved and referenced.
**Validates: Requirements 12.4**

### Property 24: Context Compaction
*For any* conversation context exceeding a threshold size, older context SHALL be compacted or summarized.
**Validates: Requirements 12.5**

### Property 25: User-Scoped Data Isolation
*For any* user, they SHALL only access profiles and theories associated with their user ID.
**Validates: Requirements 13.4, 14.3, 14.5**

### Property 26: Theory Persistence
*For any* theory discussed by a user, it SHALL be stored in that user's long-term memory.
**Validates: Requirements 13.1**

### Property 27: Theory Status Updates
*For any* theory that is validated or refuted, its status SHALL be updated in the user's memory.
**Validates: Requirements 13.2**

### Property 28: Related Theory Retrieval
*For any* new theory that relates to a previous theory, the previous theory SHALL be retrieved and referenced.
**Validates: Requirements 13.3**

### Property 29: Profile Auto-Creation
*For any* entity (character, location, episode, fragment group, theory) first mentioned by a user, a profile SHALL be automatically created for that user.
**Validates: Requirements 14.2, 15.2, 16.2, 17.2, 18.2**

### Property 30: Profile Information Extraction
*For any* conversation revealing information about an entity, that information SHALL be extracted and stored in the user's profile for that entity.
**Validates: Requirements 14.1, 15.1, 16.1, 17.1, 18.1**

### Property 31: Profile Information Updates
*For any* new information discovered about an entity, only that user's profile SHALL be updated.
**Validates: Requirements 14.4, 15.4, 16.4, 17.4, 18.4**

### Property 32: Profile Usage in Responses
*For any* query about an entity, information from that user's profile for that entity SHALL be retrieved and used.
**Validates: Requirements 14.3, 15.3, 16.3, 17.3, 18.3**

### Property 33: Request Tracking Creation
*For any* user message, a unique requestId SHALL be generated and stored with status "processing".
**Validates: Requirements 23.1**

### Property 34: Request Status Tracking
*For any* request being processed, the system SHALL track requestId, userId, connectionId, and accumulated response.
**Validates: Requirements 23.2**

### Property 35: Reconnection Resume
*For any* reconnection with a valid requestId, the system SHALL allow resuming response delivery from where it left off.
**Validates: Requirements 23.4**

### Property 36: Request Completion
*For any* completed request, the status SHALL be updated to "complete" and the full response SHALL be stored.
**Validates: Requirements 23.5**
