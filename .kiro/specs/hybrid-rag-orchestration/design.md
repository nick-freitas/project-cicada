# Hybrid RAG Orchestration Design Document

## Overview

This design addresses the critical issue where Bedrock Agents fail to reliably invoke their defined tools despite explicit instructions. The solution is a **hybrid orchestration approach** that combines:

1. **Custom RAG** (Retrieval-Augmented Generation) for script queries - direct semantic search + model invocation
2. **Agent-based orchestration** for profile and theory operations - leveraging specialized agents

This approach maintains the multi-agent architecture benefits while ensuring reliable script search functionality and optimizing costs.

### Problem Statement

**Root Cause**: Bedrock Agents (tested with Nova Pro and Gemma 3 27B) do not reliably follow tool usage instructions:
- Orchestrator Agent calls wrong tools (Profile instead of Query)
- Query Agent acknowledges need to search but doesn't invoke `search_knowledge_base` tool
- Agents return hallucinated information without using available search tools
- Issue persists across different models and instruction variations

**Impact**:
- Users receive inaccurate information about Higurashi script content
- System cannot be trusted for its primary use case
- Agent-based approach adds cost without reliability benefit for script queries

**Solution**: Bypass agent tool selection for script queries while maintaining agents for profile/theory operations where they add value.

## Architecture

### High-Level Flow

```
User Query
    │
    ▼
Message Processor (Lambda)
    │
    ├─ Query Classification
    │  ├─ Script Query → Custom RAG
    │  ├─ Profile Request → Profile Agent
    │  ├─ Theory Request → Theory Agent
    │  └─ General → Custom RAG (default)
    │
    ├─ Custom RAG Path:
    │  ├─ 1. Semantic Search (vector similarity)
    │  ├─ 2. Format Context (citations + passages)
    │  ├─ 3. Build Prompt (system + context + query)
    │  ├─ 4. Invoke Bedrock Model (direct, no agent)
    │  └─ 5. Stream Response (WebSocket)
    │
    ├─ Profile Agent Path:
    │  ├─ 1. Invoke Profile Agent (Bedrock Agent)
    │  ├─ 2. Agent performs profile operations
    │  └─ 3. Stream Response (WebSocket)
    │
    └─ Theory Agent Path:
       ├─ 1. Invoke Theory Agent (Bedrock Agent)
       ├─ 2. Agent may invoke Custom RAG for evidence
       └─ 3. Stream Response (WebSocket)
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Message Processor Lambda                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Query Classifier                                        │   │
│  │  - Keyword matching                                      │   │
│  │  - Intent detection                                      │   │
│  │  - Route decision                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Custom RAG Handler                                      │   │
│  │  - Semantic search                                       │   │
│  │  - Context formatting                                    │   │
│  │  - Direct model invocation                               │   │
│  │  - Response streaming                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Agent Invocation Handler                                │   │
│  │  - Profile Agent invocation                              │   │
│  │  - Theory Agent invocation                               │   │
│  │  - Response streaming                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Knowledge    │  │ Bedrock      │  │ Bedrock      │          │
│  │ Base Service │  │ Runtime      │  │ Agents       │          │
│  │ (S3+Vectors) │  │ (Direct)     │  │ (Profile/    │          │
│  │              │  │              │  │  Theory)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```


## Detailed Component Design

### 1. Query Classifier

**Purpose**: Determine the appropriate handler for each user query

**Classification Logic**:
```typescript
enum QueryType {
  SCRIPT_QUERY = 'script_query',      // Questions about script content
  PROFILE_REQUEST = 'profile_request', // Profile operations
  THEORY_REQUEST = 'theory_request',   // Theory analysis
  GENERAL = 'general'                  // Default to custom RAG
}

interface ClassificationResult {
  type: QueryType;
  confidence: number;
  reasoning: string;
}

function classifyQuery(query: string): ClassificationResult {
  const lowerQuery = query.toLowerCase();
  
  // Profile request patterns
  const profileKeywords = [
    'show me', 'list', 'view profile', 'my profile',
    'update profile', 'save profile', 'create profile'
  ];
  
  // Theory request patterns
  const theoryKeywords = [
    'theory', 'hypothesis', 'analyze theory', 'validate theory',
    'evidence for', 'evidence against', 'refute', 'support'
  ];
  
  // Check for explicit profile requests
  if (profileKeywords.some(kw => lowerQuery.includes(kw))) {
    return {
      type: QueryType.PROFILE_REQUEST,
      confidence: 0.9,
      reasoning: 'Explicit profile operation keywords detected'
    };
  }
  
  // Check for theory analysis requests
  if (theoryKeywords.some(kw => lowerQuery.includes(kw))) {
    return {
      type: QueryType.THEORY_REQUEST,
      confidence: 0.85,
      reasoning: 'Theory analysis keywords detected'
    };
  }
  
  // Default to script query (custom RAG)
  return {
    type: QueryType.SCRIPT_QUERY,
    confidence: 0.8,
    reasoning: 'Default to script query for Higurashi content'
  };
}
```

**Design Rationale**:
- Simple keyword-based classification (no LLM needed, saves cost)
- Conservative approach: defaults to custom RAG for ambiguous queries
- Explicit keywords for profile/theory operations
- Can be enhanced later with ML-based classification if needed


### 2. Custom RAG Handler

**Purpose**: Perform reliable script search and response generation without agent tool selection

**Implementation Flow**:

```typescript
async function handleCustomRAG(
  query: string,
  userId: string,
  requestId: string,
  connectionId: string
): Promise<void> {
  
  // Step 1: Semantic Search
  logger.info('Performing semantic search', { requestId, query: query.substring(0, 50) });
  
  const searchResults = await semanticSearch(query, {
    topK: 20,              // Get top 20 results
    minScore: 0.5,         // Minimum similarity threshold
    maxEmbeddingsToLoad: 3000  // Performance limit
  });
  
  logger.info('Search completed', {
    requestId,
    resultCount: searchResults.length,
    topScore: searchResults[0]?.score
  });
  
  // Step 2: Format Context
  let contextText = '';
  if (searchResults.length > 0) {
    contextText = 'Here are relevant passages from the Higurashi script:\n\n';
    
    // Use top 10 results for context (balance between coverage and token cost)
    searchResults.slice(0, 10).forEach((result, idx) => {
      contextText += `[${idx + 1}] Episode: ${result.episodeName}, `;
      contextText += `Chapter: ${result.chapterId}, Message: ${result.messageId}\n`;
      
      if (result.speaker) {
        contextText += `Speaker: ${result.speaker}\n`;
      }
      
      contextText += `Text: ${result.textENG}\n`;
      contextText += `Relevance: ${(result.score * 100).toFixed(1)}%\n\n`;
    });
  } else {
    contextText = 'No relevant passages found in the script for this query.\n\n';
  }
  
  // Step 3: Build Prompt
  const systemPrompt = buildSystemPrompt();
  const userPrompt = `${contextText}User question: ${query}\n\n` +
    `Based on the script passages above, please answer the user's question. ` +
    `Cite specific episodes and chapters in your response.`;
  
  // Step 4: Invoke Bedrock Model (Direct)
  logger.info('Invoking Bedrock model', { requestId, model: MODEL_ID });
  
  const command = new ConverseStreamCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: userPrompt }] }],
    system: [{ text: systemPrompt }],
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9
    }
  });
  
  const response = await bedrockClient.send(command);
  
  // Step 5: Stream Response
  await streamResponse(response, requestId, connectionId);
}
```

**System Prompt Design**:
```typescript
function buildSystemPrompt(): string {
  return `You are CICADA, an AI assistant for analyzing "Higurashi no Naku Koro Ni". 

You have access to the complete script database through semantic search. When answering questions:

1. Base your response STRICTLY on the provided script passages
2. Cite specific episodes, chapters, and speakers
3. If no relevant passages are found, say so honestly - never make up information
4. Maintain episode boundaries - don't mix information from different story arcs
5. When multiple episodes are relevant, clearly attribute information to each episode
6. Include speaker names when discussing dialogue
7. Be conversational but accurate - always ground responses in script evidence

Your goal is to help users explore and understand the Higurashi narrative through accurate, well-cited information.`;
}
```

**Design Rationale**:
- **Direct model invocation**: Bypasses unreliable agent tool selection
- **Explicit context**: All relevant passages provided upfront in prompt
- **Clear instructions**: Model knows exactly what to do with the context
- **Cost-effective**: Single model call instead of agent + tool invocations
- **Reliable**: No dependency on agent decision-making


### 3. Agent Invocation Handler

**Purpose**: Invoke specialized agents (Profile, Theory) for operations where they add value

**Implementation**:

```typescript
async function handleAgentInvocation(
  queryType: QueryType,
  query: string,
  userId: string,
  sessionId: string,
  requestId: string,
  connectionId: string
): Promise<void> {
  
  const agentId = queryType === QueryType.PROFILE_REQUEST 
    ? PROFILE_AGENT_ID 
    : THEORY_AGENT_ID;
    
  const agentAliasId = queryType === QueryType.PROFILE_REQUEST
    ? PROFILE_AGENT_ALIAS_ID
    : THEORY_AGENT_ALIAS_ID;
  
  logger.info('Invoking agent', {
    requestId,
    queryType,
    agentId,
    agentAliasId
  });
  
  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: query,
      enableTrace: true  // For debugging
    });
    
    const response = await agentRuntimeClient.send(command);
    
    if (!response.completion) {
      throw new Error('No completion stream from agent');
    }
    
    // Stream agent response
    let fullResponse = '';
    
    for await (const event of response.completion) {
      if (event.chunk?.bytes) {
        const chunkText = new TextDecoder().decode(event.chunk.bytes);
        fullResponse += chunkText;
        
        // Store and send chunk
        await requestTrackingService.addResponseChunk(requestId, chunkText);
        await sendToConnection(DOMAIN_NAME, STAGE, connectionId, {
          requestId,
          type: 'chunk',
          content: chunkText
        });
      }
      
      // Log trace events for debugging
      if (event.trace) {
        logger.debug('Agent trace', { requestId, trace: event.trace });
      }
    }
    
    // Send completion
    await sendToConnection(DOMAIN_NAME, STAGE, connectionId, {
      requestId,
      type: 'complete'
    });
    
    await requestTrackingService.completeRequest(requestId, fullResponse);
    
    logger.info('Agent invocation complete', {
      requestId,
      responseLength: fullResponse.length
    });
    
  } catch (error) {
    logger.error('Agent invocation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
      queryType
    });
    throw error;
  }
}
```

**Design Rationale**:
- **Selective agent use**: Only for profile/theory operations where agents add value
- **Maintains multi-agent architecture**: Profile and Theory agents still used
- **Consistent streaming**: Same WebSocket streaming pattern as custom RAG
- **Error handling**: Proper logging and error propagation


### 4. Response Streaming

**Purpose**: Deliver responses to users in real-time via WebSocket

**Implementation** (shared by both Custom RAG and Agent paths):

```typescript
async function streamResponse(
  response: ConverseStreamCommandOutput | InvokeAgentCommandOutput,
  requestId: string,
  connectionId: string
): Promise<void> {
  
  let fullResponse = '';
  
  // Handle Bedrock Runtime streaming (Custom RAG)
  if ('stream' in response && response.stream) {
    for await (const event of response.stream) {
      if (event.contentBlockDelta?.delta?.text) {
        const chunkText = event.contentBlockDelta.delta.text;
        fullResponse += chunkText;
        
        // Store chunk for reconnection support
        await requestTrackingService.addResponseChunk(requestId, chunkText);
        
        // Send chunk to client
        const chunkResponse: WebSocketResponse = {
          requestId,
          type: 'chunk',
          content: chunkText
        };
        
        await sendToConnection(DOMAIN_NAME, STAGE, connectionId, chunkResponse);
      }
      
      if (event.messageStop) {
        logger.info('Stream completed', {
          requestId,
          responseLength: fullResponse.length
        });
      }
    }
  }
  
  // Send completion marker
  const completeResponse: WebSocketResponse = {
    requestId,
    type: 'complete'
  };
  
  await sendToConnection(DOMAIN_NAME, STAGE, connectionId, completeResponse);
  
  // Mark request as complete in tracking
  await requestTrackingService.completeRequest(requestId, fullResponse);
}
```

**Design Rationale**:
- **Unified streaming**: Same pattern for both custom RAG and agent responses
- **Reconnection support**: All chunks stored in DynamoDB
- **Completion marker**: Client knows when response is done
- **Request tracking**: Full response stored for debugging and reconnection

