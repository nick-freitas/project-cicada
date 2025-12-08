# CICADA Architecture Diagrams

This document provides visual representations of CICADA's architecture using Mermaid diagrams.

## Table of Contents

1. [High-Level System Architecture](#high-level-system-architecture)
2. [Multi-Agent Architecture](#multi-agent-architecture)
3. [Request Flow](#request-flow)
4. [Agent Coordination Flow](#agent-coordination-flow)
5. [Data Flow](#data-flow)
6. [Infrastructure Stacks](#infrastructure-stacks)

## High-Level System Architecture

```mermaid
graph TB
    subgraph "Frontend"
        UI[React Application]
        WS[WebSocket Client]
    end

    subgraph "AWS Cloud"
        subgraph "API Layer"
            APIGW[API Gateway<br/>REST + WebSocket]
            SQS[SQS Queue]
        end

        subgraph "Compute Layer"
            WSH[WebSocket Handler<br/>Lambda]
            MP[Message Processor<br/>Lambda]
        end

        subgraph "Agent Layer - AgentCore"
            ORCH[Orchestrator Agent<br/>Nova Lite]
            QUERY[Query Agent<br/>Nova Lite]
            THEORY[Theory Agent<br/>Nova Lite]
            PROFILE[Profile Agent<br/>Nova Lite]
        end

        subgraph "Data Layer"
            DDB[(DynamoDB<br/>Profiles, Memory)]
            S3[(S3<br/>Scripts, Frontend)]
            KB[Knowledge Base<br/>Bedrock]
        end

        subgraph "Auth"
            COGNITO[Cognito<br/>User Pool]
        end
    end

    UI -->|HTTPS| APIGW
    UI -->|WSS| WS
    WS -->|WebSocket| APIGW
    APIGW -->|Invoke| WSH
    WSH -->|Enqueue| SQS
    SQS -->|Trigger| MP
    MP -->|Invoke| ORCH
    ORCH -->|Coordinate| QUERY
    ORCH -->|Coordinate| THEORY
    ORCH -->|Coordinate| PROFILE
    QUERY -->|Search| KB
    THEORY -->|Invoke| QUERY
    THEORY -->|Access| DDB
    PROFILE -->|Read/Write| DDB
    MP -->|Stream| APIGW
    APIGW -->|Stream| WS
    UI -->|Auth| COGNITO
    COGNITO -->|Verify| APIGW

    style ORCH fill:#ff9999
    style QUERY fill:#99ccff
    style THEORY fill:#99ff99
    style PROFILE fill:#ffcc99
```

## Multi-Agent Architecture

```mermaid
graph TB
    subgraph "User Interface"
        USER[User Query]
    end

    subgraph "Message Processing"
        MP[Message Processor<br/>Lambda]
    end

    subgraph "AgentCore - Orchestrator"
        ORCH[Orchestrator Agent]
        INTENT[Intent Analysis]
        ROUTE[Agent Routing]
        AGG[Response Aggregation]
    end

    subgraph "Specialized Agents"
        QUERY[Query Agent<br/>Script Search & Citations]
        THEORY[Theory Agent<br/>Theory Analysis]
        PROFILE[Profile Agent<br/>Knowledge Extraction]
    end

    subgraph "Supporting Services"
        KB[Knowledge Base<br/>Semantic Search]
        PS[Profile Service<br/>DynamoDB]
        MS[Memory Service<br/>DynamoDB]
    end

    USER -->|Query| MP
    MP -->|Invoke| ORCH
    ORCH --> INTENT
    INTENT --> ROUTE
    ROUTE -->|Script Query| QUERY
    ROUTE -->|Theory Analysis| THEORY
    ROUTE -->|Profile Update| PROFILE
    QUERY -->|Search| KB
    QUERY -->|Return Results| AGG
    THEORY -->|Invoke| QUERY
    THEORY -->|Access| PS
    THEORY -->|Return Analysis| AGG
    PROFILE -->|Extract & Update| PS
    PROFILE -->|Return Updates| AGG
    AGG -->|Stream Response| MP
    MP -->|WebSocket| USER
    ORCH -.->|Session Context| MS

    style ORCH fill:#ff9999
    style QUERY fill:#99ccff
    style THEORY fill:#99ff99
    style PROFILE fill:#ffcc99
```

## Request Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant APIGateway
    participant WSHandler
    participant SQS
    participant MsgProcessor
    participant Orchestrator
    participant QueryAgent
    participant DynamoDB

    User->>Frontend: Enter query
    Frontend->>APIGateway: Send via WebSocket
    APIGateway->>WSHandler: Invoke Lambda
    WSHandler->>SQS: Enqueue message
    WSHandler-->>APIGateway: Acknowledge
    APIGateway-->>Frontend: Acknowledged
    
    SQS->>MsgProcessor: Trigger Lambda
    MsgProcessor->>DynamoDB: Update status: processing
    MsgProcessor->>Orchestrator: InvokeAgentCommand
    
    Orchestrator->>Orchestrator: Analyze intent
    Orchestrator->>QueryAgent: Invoke for search
    QueryAgent->>QueryAgent: Search Knowledge Base
    QueryAgent-->>Orchestrator: Return citations
    
    Orchestrator-->>MsgProcessor: Stream chunk 1
    MsgProcessor->>DynamoDB: Store chunk 1
    MsgProcessor->>APIGateway: Send chunk 1
    APIGateway->>Frontend: Deliver chunk 1
    Frontend->>User: Display chunk 1
    
    Orchestrator-->>MsgProcessor: Stream chunk 2
    MsgProcessor->>DynamoDB: Store chunk 2
    MsgProcessor->>APIGateway: Send chunk 2
    APIGateway->>Frontend: Deliver chunk 2
    Frontend->>User: Display chunk 2
    
    Orchestrator-->>MsgProcessor: Stream complete
    MsgProcessor->>DynamoDB: Update status: complete
    MsgProcessor->>APIGateway: Send complete marker
    APIGateway->>Frontend: Deliver complete
    Frontend->>User: Show complete
```

## Agent Coordination Flow

```mermaid
sequenceDiagram
    participant MP as Message Processor
    participant ORCH as Orchestrator Agent
    participant QUERY as Query Agent
    participant THEORY as Theory Agent
    participant PROFILE as Profile Agent
    participant KB as Knowledge Base
    participant DDB as DynamoDB

    MP->>ORCH: "Analyze theory: Takano is behind incidents"
    
    Note over ORCH: Analyze intent<br/>Decision: Theory analysis needed
    
    ORCH->>THEORY: Invoke Theory Agent
    
    Note over THEORY: Need evidence
    
    THEORY->>QUERY: "Find evidence about Takano"
    QUERY->>KB: Semantic search
    KB-->>QUERY: Search results
    QUERY-->>THEORY: Citations with evidence
    
    THEORY->>QUERY: "Find contradicting evidence"
    QUERY->>KB: Semantic search
    KB-->>QUERY: Search results
    QUERY-->>THEORY: Citations
    
    THEORY->>DDB: Access profiles
    DDB-->>THEORY: Profile data
    
    Note over THEORY: Analyze evidence<br/>Generate refinements
    
    THEORY-->>ORCH: Analysis + Evidence + Refinements
    
    ORCH->>PROFILE: Extract insights from analysis
    PROFILE->>DDB: Update profiles
    DDB-->>PROFILE: Confirmation
    PROFILE-->>ORCH: Profile updates
    
    Note over ORCH: Aggregate responses
    
    ORCH-->>MP: Stream complete response
    MP-->>MP: Forward to user
```

## Data Flow

```mermaid
graph LR
    subgraph "Input"
        USER[User Query]
    end

    subgraph "Processing"
        ORCH[Orchestrator<br/>Intent Analysis]
        AGENTS[Specialized<br/>Agents]
    end

    subgraph "Data Sources"
        KB[(Knowledge Base<br/>Script Data)]
        PROFILES[(DynamoDB<br/>User Profiles)]
        MEMORY[(DynamoDB<br/>Conversation Memory)]
        CONFIG[(DynamoDB<br/>Episode Config)]
    end

    subgraph "Output"
        RESPONSE[Streaming<br/>Response]
        CITATIONS[Citations]
        UPDATES[Profile<br/>Updates]
    end

    USER --> ORCH
    ORCH --> AGENTS
    AGENTS --> KB
    AGENTS --> PROFILES
    AGENTS --> MEMORY
    AGENTS --> CONFIG
    KB --> CITATIONS
    PROFILES --> UPDATES
    AGENTS --> RESPONSE
    CITATIONS --> RESPONSE
    UPDATES --> RESPONSE
    RESPONSE --> USER

    style KB fill:#e1f5ff
    style PROFILES fill:#fff4e1
    style MEMORY fill:#f0f0f0
    style CONFIG fill:#f0f0f0
```

## Infrastructure Stacks

```mermaid
graph TB
    subgraph "CDK Application"
        APP[CDK App]
    end

    subgraph "Stack Dependencies"
        DATA[DataStack<br/>DynamoDB, S3, KB]
        AUTH[AuthStack<br/>Cognito]
        AGENT[AgentStack<br/>AgentCore Agents]
        API[APIStack<br/>API Gateway, SQS]
        COMPUTE[ComputeStack<br/>Lambda Functions]
        FRONTEND[FrontendStack<br/>S3, CloudFront]
        MONITOR[MonitoringStack<br/>CloudWatch]
    end

    APP --> DATA
    APP --> AUTH
    DATA --> AGENT
    DATA --> API
    AUTH --> API
    AGENT --> COMPUTE
    API --> COMPUTE
    DATA --> FRONTEND
    DATA --> MONITOR
    AGENT --> MONITOR
    API --> MONITOR

    style DATA fill:#e1f5ff
    style AUTH fill:#ffe1e1
    style AGENT fill:#ff9999
    style API fill:#e1ffe1
    style COMPUTE fill:#fff4e1
    style FRONTEND fill:#f0e1ff
    style MONITOR fill:#ffffcc
```

## Agent Tool Architecture

```mermaid
graph TB
    subgraph "Orchestrator Agent"
        ORCH_MAIN[Main Agent Logic]
        ORCH_TOOLS[Agent Tools]
    end

    subgraph "Orchestrator Tools"
        TOOL_QUERY[invoke_query_agent]
        TOOL_THEORY[invoke_theory_agent]
        TOOL_PROFILE[invoke_profile_agent]
    end

    subgraph "Query Agent"
        QUERY_MAIN[Main Agent Logic]
        QUERY_TOOLS[Agent Tools]
    end

    subgraph "Query Tools"
        TOOL_SEARCH[search_knowledge_base]
        TOOL_CITE[format_citation]
        TOOL_NUANCE[analyze_nuance]
    end

    subgraph "Theory Agent"
        THEORY_MAIN[Main Agent Logic]
        THEORY_TOOLS[Agent Tools]
    end

    subgraph "Theory Tools"
        TOOL_EVIDENCE[invoke_query_agent]
        TOOL_ACCESS[access_profile]
        TOOL_UPDATE[update_profile]
    end

    subgraph "Profile Agent"
        PROFILE_MAIN[Main Agent Logic]
        PROFILE_TOOLS[Agent Tools]
    end

    subgraph "Profile Tools"
        TOOL_EXTRACT[extract_entity]
        TOOL_GET[get_profile]
        TOOL_CREATE[create_profile]
        TOOL_PUPDATE[update_profile]
    end

    ORCH_MAIN --> ORCH_TOOLS
    ORCH_TOOLS --> TOOL_QUERY
    ORCH_TOOLS --> TOOL_THEORY
    ORCH_TOOLS --> TOOL_PROFILE

    TOOL_QUERY -->|Invokes| QUERY_MAIN
    TOOL_THEORY -->|Invokes| THEORY_MAIN
    TOOL_PROFILE -->|Invokes| PROFILE_MAIN

    QUERY_MAIN --> QUERY_TOOLS
    QUERY_TOOLS --> TOOL_SEARCH
    QUERY_TOOLS --> TOOL_CITE
    QUERY_TOOLS --> TOOL_NUANCE

    THEORY_MAIN --> THEORY_TOOLS
    THEORY_TOOLS --> TOOL_EVIDENCE
    THEORY_TOOLS --> TOOL_ACCESS
    THEORY_TOOLS --> TOOL_UPDATE

    TOOL_EVIDENCE -->|Invokes| QUERY_MAIN

    PROFILE_MAIN --> PROFILE_TOOLS
    PROFILE_TOOLS --> TOOL_EXTRACT
    PROFILE_TOOLS --> TOOL_GET
    PROFILE_TOOLS --> TOOL_CREATE
    PROFILE_TOOLS --> TOOL_PUPDATE

    style ORCH_MAIN fill:#ff9999
    style QUERY_MAIN fill:#99ccff
    style THEORY_MAIN fill:#99ff99
    style PROFILE_MAIN fill:#ffcc99
```

## Streaming Architecture

```mermaid
sequenceDiagram
    participant Frontend
    participant WebSocket
    participant MsgProcessor
    participant Agent
    participant DynamoDB

    Frontend->>WebSocket: Send query
    WebSocket->>MsgProcessor: Trigger processing
    MsgProcessor->>Agent: InvokeAgentCommand
    
    loop Streaming Chunks
        Agent-->>MsgProcessor: Stream chunk
        MsgProcessor->>DynamoDB: Store chunk
        MsgProcessor->>WebSocket: Forward chunk
        WebSocket->>Frontend: Deliver chunk
        Frontend->>Frontend: Display chunk
    end
    
    Agent-->>MsgProcessor: Stream complete
    MsgProcessor->>DynamoDB: Update status
    MsgProcessor->>WebSocket: Send complete marker
    WebSocket->>Frontend: Deliver complete
    Frontend->>Frontend: Mark complete

    Note over Frontend,DynamoDB: If connection drops, chunks are stored<br/>for reconnection and replay
```

## Cost Optimization Flow

```mermaid
graph TB
    subgraph "Query Processing"
        QUERY[User Query]
        ORCH[Orchestrator<br/>Nova Lite]
    end

    subgraph "Agent Selection"
        INTENT[Intent Analysis]
        DECISION{Which Agents?}
    end

    subgraph "Specialized Processing"
        QUERY_AGENT[Query Agent<br/>Nova Lite<br/>~750 tokens]
        THEORY_AGENT[Theory Agent<br/>Nova Lite<br/>~650 tokens]
        PROFILE_AGENT[Profile Agent<br/>Nova Lite<br/>~450 tokens]
    end

    subgraph "Cost Tracking"
        TOKENS[Token Usage<br/>Monitoring]
        COST[Cost per Query<br/>~$0.0003]
    end

    QUERY --> ORCH
    ORCH --> INTENT
    INTENT --> DECISION
    DECISION -->|Script Query| QUERY_AGENT
    DECISION -->|Theory Analysis| THEORY_AGENT
    DECISION -->|Always| PROFILE_AGENT
    QUERY_AGENT --> TOKENS
    THEORY_AGENT --> TOKENS
    PROFILE_AGENT --> TOKENS
    TOKENS --> COST

    style ORCH fill:#ff9999
    style QUERY_AGENT fill:#99ccff
    style THEORY_AGENT fill:#99ff99
    style PROFILE_AGENT fill:#ffcc99
    style COST fill:#ffffcc
```

## Security Architecture

```mermaid
graph TB
    subgraph "User"
        USER[User]
    end

    subgraph "Authentication"
        COGNITO[Cognito User Pool]
        JWT[JWT Token]
    end

    subgraph "Authorization"
        APIGW[API Gateway<br/>Authorizer]
        IAM[IAM Policies]
    end

    subgraph "Data Access"
        LAMBDA[Lambda Functions]
        AGENTS[AgentCore Agents]
    end

    subgraph "Data Layer"
        DDB[(DynamoDB<br/>User-Scoped)]
        S3[(S3<br/>Encrypted)]
        KB[Knowledge Base<br/>Read-Only]
    end

    USER -->|Login| COGNITO
    COGNITO -->|Issue| JWT
    USER -->|Request + JWT| APIGW
    APIGW -->|Verify| COGNITO
    APIGW -->|Authorize| IAM
    APIGW -->|Invoke| LAMBDA
    LAMBDA -->|Invoke| AGENTS
    AGENTS -->|userId Filter| DDB
    AGENTS -->|Read| S3
    AGENTS -->|Search| KB

    style COGNITO fill:#ffe1e1
    style IAM fill:#ffe1e1
    style DDB fill:#e1f5ff
    style S3 fill:#e1f5ff
```

## References

- [AgentCore Architecture](../packages/backend/docs/AGENTCORE_ARCHITECTURE.md)
- [Agent Invocation Examples](../packages/backend/docs/AGENT_INVOCATION_EXAMPLES.md)
- [Streaming Implementation](../packages/backend/docs/STREAMING_IMPLEMENTATION.md)
- [Design Document](../.kiro/specs/agentcore-implementation/design.md)
