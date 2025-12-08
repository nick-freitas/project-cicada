# Requirements Document: AgentCore Migration

## Introduction

This spec addresses the critical issue where Bedrock Agents (managed service) fail to reliably invoke their defined tools despite explicit instructions. The solution is to migrate from **Bedrock Agents** (managed service) to **AgentCore** (framework/SDK), which gives us full control over agent orchestration and tool invocation logic while maintaining the multi-agent architecture.

## Glossary

- **Bedrock Agents**: AWS managed service where AWS controls agent behavior and tool selection (current implementation)
- **AgentCore**: AWS framework/SDK (Strands) that gives developers full control over agent orchestration logic
- **Strands SDK**: The TypeScript/Python SDK for building AgentCore agents
- **Tool Invocation**: Calling functions/services from within an agent (e.g., semantic search, profile operations)
- **Orchestrator Agent**: Central coordinator that routes queries to specialized agents
- **Query Agent**: Specialized agent for script search and citation
- **Profile Agent**: Specialized agent for profile management operations
- **Theory Agent**: Specialized agent for theory analysis and evidence gathering

## Problem Statement

**Current Issue**: Bedrock Agents (managed service) do not reliably follow tool usage instructions:
- Orchestrator Agent calls wrong tools (Profile instead of Query)
- Query Agent acknowledges need to search but doesn't invoke `search_knowledge_base` tool
- Agents return hallucinated information without using available search tools
- Issue persists across different models (Nova Pro, Gemma 3 27B) and instruction variations

**Root Cause**: In Bedrock Agents, AWS controls the tool selection logic. We define tools but cannot control when/how they are invoked.

**Solution**: Migrate to AgentCore framework where we write the orchestration code and explicitly control tool invocation.

## Requirements

### Requirement 1: AgentCore Framework Setup

**User Story:** As a developer, I want to set up the AgentCore framework with all its components, so that I can build a multi-user agent system with controlled orchestration.

#### Acceptance Criteria

1. WHEN the AgentCore SDK is installed, THEN the system SHALL have access to the Strands SDK for TypeScript
2. WHEN setting up AgentCore, THEN the system SHALL configure Gateway, Identity, Policy, and Memory components
3. WHEN deploying agents, THEN they SHALL run as Lambda functions with AgentCore runtime
4. WHEN agents are invoked, THEN they SHALL use the AgentCore Gateway as the entry point
5. WHEN the framework is configured, THEN it SHALL support streaming responses via WebSocket


### Requirement 2: Custom Query Agent with Deterministic Tool Invocation

**User Story:** As a user, I want the Query Agent to reliably search the script database, so that I receive accurate, cited information about Higurashi content.

#### Acceptance Criteria

1. WHEN a query requires script search, THEN the Query Agent SHALL explicitly invoke the semantic search tool
2. WHEN the search tool is invoked, THEN it SHALL always execute (no autonomous decision-making)
3. WHEN search results are returned, THEN the agent SHALL format them with complete citations
4. WHEN no results are found, THEN the agent SHALL honestly state no information was found
5. WHEN the agent generates a response, THEN it SHALL be based strictly on search results

### Requirement 3: Orchestrator Agent with Explicit Routing Logic

**User Story:** As a system, I want the Orchestrator Agent to reliably route queries to the correct specialized agent, so that each query type gets appropriate processing.

#### Acceptance Criteria

1. WHEN a user query is received, THEN the Orchestrator SHALL classify it using explicit logic (not autonomous decision)
2. WHEN the query is about script content, THEN the Orchestrator SHALL invoke the Query Agent
3. WHEN the query is about profiles, THEN the Orchestrator SHALL invoke the Profile Agent
4. WHEN the query is about theories, THEN the Orchestrator SHALL invoke the Theory Agent
5. WHEN routing decisions are made, THEN they SHALL be logged for debugging

### Requirement 4: Profile Agent Migration

**User Story:** As a user, I want to manage character/location profiles, so that I can build knowledge over time.

#### Acceptance Criteria

1. WHEN the Profile Agent is migrated to AgentCore, THEN it SHALL maintain all existing functionality
2. WHEN profile operations are requested, THEN the agent SHALL explicitly invoke profile service tools
3. WHEN profiles are updated, THEN the changes SHALL be persisted to DynamoDB
4. WHEN profile operations fail, THEN the agent SHALL provide meaningful error messages
5. WHEN the agent is invoked, THEN it SHALL stream responses via WebSocket

### Requirement 5: Theory Agent Migration

**User Story:** As a user, I want to analyze theories with evidence gathering, so that I can develop and validate narrative hypotheses.

#### Acceptance Criteria

1. WHEN the Theory Agent is migrated to AgentCore, THEN it SHALL maintain all existing functionality
2. WHEN evidence gathering is needed, THEN the agent SHALL explicitly invoke the Query Agent
3. WHEN theory analysis is complete, THEN results SHALL be streamed to the user
4. WHEN theories are validated or refuted, THEN the status SHALL be updated in user profiles
5. WHEN the agent encounters errors, THEN it SHALL handle them gracefully

### Requirement 6: Tool Definition and Registration

**User Story:** As a developer, I want to define tools that agents can invoke, so that agents have access to required functionality.

#### Acceptance Criteria

1. WHEN tools are defined, THEN they SHALL have clear input/output schemas
2. WHEN the semantic search tool is registered, THEN it SHALL accept query text and search options
3. WHEN profile service tools are registered, THEN they SHALL support CRUD operations
4. WHEN tools are invoked, THEN they SHALL return structured results
5. WHEN tool invocation fails, THEN errors SHALL be propagated to the calling agent


### Requirement 7: Agent-to-Agent Communication via Sub-Agents

**User Story:** As a system, I want agents to communicate with each other as sub-agents, so that complex workflows can be orchestrated.

#### Acceptance Criteria

1. WHEN the Orchestrator is configured, THEN Query, Theory, and Profile agents SHALL be registered as sub-agents (not tools)
2. WHEN the Orchestrator invokes a specialized agent, THEN it SHALL use the `invokeSubAgent()` method
3. WHEN the Theory Agent needs evidence, THEN it SHALL invoke the Query Agent as a sub-agent
4. WHEN sub-agents are invoked, THEN identity and memory context SHALL be passed to them
5. WHEN agent chains execute, THEN the full execution trace SHALL be logged

### Requirement 8: AgentCore Gateway Integration

**User Story:** As a system, I want an AgentCore Gateway as the entry point, so that all requests are properly routed and managed.

#### Acceptance Criteria

1. WHEN a user query is received, THEN it SHALL be sent to the AgentCore Gateway
2. WHEN the Gateway receives a request, THEN it SHALL route it to the Orchestrator Agent
3. WHEN the Gateway processes requests, THEN it SHALL manage WebSocket streaming
4. WHEN errors occur, THEN the Gateway SHALL handle them and return user-friendly messages
5. WHEN requests complete, THEN the Gateway SHALL send completion markers to the client

### Requirement 9: AgentCore Identity for Multi-User Support

**User Story:** As a system, I want AgentCore Identity to manage user authentication, so that multiple users can use the system with data isolation.

#### Acceptance Criteria

1. WHEN a user makes a request, THEN their identity (userId, username) SHALL be extracted from the authentication token
2. WHEN identity is established, THEN it SHALL be passed to all agents in the request chain
3. WHEN agents access data, THEN they SHALL scope all operations to the user's identity
4. WHEN a user tries to access another user's data, THEN the system SHALL deny access
5. WHEN identity is missing or invalid, THEN the system SHALL reject the request

### Requirement 10: AgentCore Policy for Access Control

**User Story:** As a system operator, I want AgentCore Policy to control access and permissions, so that users are properly isolated and rate-limited.

#### Acceptance Criteria

1. WHEN a policy is defined, THEN it SHALL specify allowed agents, data isolation level, and rate limits
2. WHEN a user makes a request, THEN their policy SHALL be enforced
3. WHEN data isolation is set to 'strict', THEN users SHALL only access their own profiles and theories
4. WHEN rate limits are exceeded, THEN the system SHALL reject requests with a clear error message
5. WHEN policy violations occur, THEN they SHALL be logged for auditing

### Requirement 11: AgentCore Memory for Conversation Context

**User Story:** As a user, I want the system to remember our conversation, so that I can have contextual discussions.

#### Acceptance Criteria

1. WHEN a user starts a session, THEN AgentCore Memory SHALL create a conversation history for that user/session
2. WHEN messages are exchanged, THEN they SHALL be stored in the user's conversation memory
3. WHEN agents process queries, THEN they SHALL have access to the conversation history
4. WHEN conversations get long, THEN old messages SHALL be compacted or summarized
5. WHEN a session ends, THEN the conversation history SHALL be persisted for future retrieval

### Requirement 12: Backward Compatibility

**User Story:** As a developer, I want the AgentCore migration to work with existing infrastructure, so that deployment is smooth.

#### Acceptance Criteria

1. WHEN agents are migrated, THEN they SHALL use the existing WebSocket infrastructure
2. WHEN responses are sent, THEN they SHALL use the existing WebSocketResponse format
3. WHEN errors occur, THEN they SHALL use existing error handling patterns
4. WHEN the system processes messages, THEN it SHALL use the existing SQS queue
5. WHEN embeddings are accessed, THEN they SHALL use the existing S3 bucket structure

### Requirement 13: Cost Optimization

**User Story:** As a system operator, I want to minimize AWS costs, so that the system stays under $100/month budget.

#### Acceptance Criteria

1. WHEN using AgentCore agents, THEN they SHALL run as Lambda functions (not managed Bedrock Agents)
2. WHEN agents invoke tools, THEN the invocations SHALL be efficient and minimize redundant calls
3. WHEN loading embeddings, THEN the system SHALL limit to 3000 max for performance
4. WHEN streaming responses, THEN the system SHALL use efficient chunking
5. WHEN agents are idle, THEN they SHALL not incur costs (Lambda cold start model)

### Requirement 14: Monitoring and Debugging

**User Story:** As a system operator, I want comprehensive logging and tracing, so that I can debug issues and monitor performance.

#### Acceptance Criteria

1. WHEN agents execute, THEN all tool invocations SHALL be logged
2. WHEN routing decisions are made, THEN the reasoning SHALL be logged
3. WHEN errors occur, THEN full stack traces SHALL be captured
4. WHEN agents communicate, THEN the message flow SHALL be traceable
5. WHEN performance issues arise, THEN execution times SHALL be measurable

### Requirement 15: Testing and Validation

**User Story:** As a developer, I want to validate the AgentCore migration works correctly, so that I can deploy with confidence.

#### Acceptance Criteria

1. WHEN the Query Agent is tested with character queries, THEN it SHALL reliably invoke search and return cited information
2. WHEN the Orchestrator is tested with various query types, THEN it SHALL route to the correct agent 100% of the time
3. WHEN the Profile Agent is tested, THEN it SHALL correctly perform CRUD operations
4. WHEN the Theory Agent is tested, THEN it SHALL correctly invoke the Query Agent for evidence
5. WHEN performance is measured, THEN response times SHALL be under 5 seconds for 90% of queries

### Requirement 16: Clean Implementation Strategy

**User Story:** As a developer, I want to replace Bedrock Agents with AgentCore, so that I have reliable tool invocation.

#### Acceptance Criteria

1. WHEN removing Bedrock Agents, THEN all Bedrock Agent resources SHALL be deleted from CDK
2. WHEN implementing AgentCore agents, THEN they SHALL be built from scratch with explicit logic
3. WHEN testing new agents, THEN they SHALL be validated against expected behavior
4. WHEN deployment is complete, THEN the system SHALL use only AgentCore agents
5. WHEN issues arise, THEN the system SHALL fail fast with clear error messages

