# Implementation Plan: AgentCore Migration

## Overview

This plan migrates from Bedrock Agents (managed service) to AgentCore framework (Strands SDK) to achieve deterministic tool invocation and reliable agent orchestration. The current system uses Bedrock Agents which fail to reliably invoke tools despite explicit instructions. AgentCore gives us full control over orchestration logic.

## Current State Analysis

**What Exists:**
- ✅ Bedrock Agents infrastructure (Orchestrator, Query, Theory, Profile) deployed via CDK
- ✅ Agent tool handlers (Lambda functions) for all agents
- ✅ Agent-to-agent invocation via BedrockAgentRuntime
- ✅ Semantic search service with vector embeddings
- ✅ Profile service with DynamoDB integration
- ✅ Memory service for conversation history
- ✅ WebSocket infrastructure for streaming responses
- ✅ Message processor using custom RAG (bypassing agents currently)

**What's Missing:**
- ❌ AgentCore/Strands SDK installation and setup
- ❌ AgentCore Gateway for request routing
- ❌ AgentCore Identity service for multi-user support
- ❌ AgentCore Policy service for access control
- ❌ AgentCore Memory integration
- ❌ AgentCore agent implementations (replacing Bedrock Agents)
- ❌ Explicit orchestration logic (deterministic routing)
- ❌ Deterministic tool invocation in agents
- ❌ Sub-agent registration and invocation patterns
- ❌ Property-based tests for correctness validation

## Implementation Tasks

### Phase 1: Setup AgentCore Framework

- [x] 1. Install and configure AgentCore SDK
  - Install @aws/strands-sdk package in backend
  - Configure TypeScript types for AgentCore
  - Set up base agent classes and interfaces
  - _Requirements: 1.1, 1.2_

- [x] 2. Implement AgentCore Identity service
  - Create IdentityService class for user authentication
  - Implement getUserIdentity() method
  - Implement validateIdentity() method
  - Add Cognito integration for user extraction
  - _Requirements: 9.1, 9.2_

- [x] 3. Implement AgentCore Policy service
  - Create PolicyService class for access control
  - Implement getPolicy() method
  - Implement enforcePolicy() method with rate limiting
  - Add data isolation enforcement (strict mode)
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 4. Implement AgentCore Memory service
  - Create MemoryService class for conversation history
  - Implement getSession() method
  - Implement addMessage() method
  - Implement compactSession() method for long conversations
  - Integrate with existing ConversationMemory DynamoDB table
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 5. Implement AgentCore Gateway
  - Create Gateway class as entry point
  - Implement handleRequest() method
  - Integrate Identity, Policy, and Memory services
  - Add WebSocket streaming support
  - Add error handling and retry logic
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

### Phase 2: Implement AgentCore Agents

- [x] 6. Implement Query Agent with AgentCore
  - Create QueryAgent class extending AgentCore Agent
  - Register SemanticSearchTool
  - Implement deterministic search invocation (ALWAYS invoke)
  - Implement citation formatting logic
  - Add system prompt with explicit instructions
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 6.1 Write property test for Query Agent search invocation
  - **Property 1: Deterministic Search Invocation**
  - **Validates: Requirements 2.1, 2.2**
  - Test that for any query, semantic search is invoked exactly once
  - Use fast-check to generate 100+ random queries
  - Verify search tool is called for each query

- [ ]* 6.2 Write property test for search results formatting
  - **Property 2: Search Results Formatting**
  - **Validates: Requirements 2.3, 6.1**
  - Test that all search results include required metadata
  - Generate random search results
  - Verify episode name, chapter ID, message ID, and text are present

- [ ]* 6.3 Write property test for empty results handling
  - **Property 3: No Hallucination on Empty Results**
  - **Validates: Requirements 2.4, 2.5**
  - Test that empty search results produce honest "no information found" response
  - Generate queries that return zero results
  - Verify response explicitly states no information was found

- [x] 7. Implement Orchestrator Agent with AgentCore
  - Create OrchestratorAgent class extending AgentCore Agent
  - Register Query, Theory, Profile as sub-agents (not tools)
  - Implement explicit classification logic (keyword-based)
  - Implement deterministic routing via switch statement
  - Add logging for all routing decisions
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 7.1 Write property test for Orchestrator routing consistency
  - **Property 4: Orchestrator Routing Consistency**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  - Test that queries with profile keywords route to Profile Agent
  - Generate random queries with known types
  - Verify 100% routing accuracy

- [ ]* 7.2 Write property test for routing decision logging
  - **Property 5: Routing Decision Logging**
  - **Validates: Requirements 3.5, 14.2**
  - Test that all routing decisions are logged
  - Generate random queries
  - Verify each routing decision produces a log entry

- [x] 8. Implement Theory Agent with AgentCore
  - Create TheoryAgent class extending AgentCore Agent
  - Register Query Agent as sub-agent
  - Implement explicit Query Agent invocation for evidence gathering
  - Implement theory analysis logic
  - Add profile update integration
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 8.1 Write property test for Theory Agent evidence gathering
  - **Property 7: Theory Agent Evidence Gathering**
  - **Validates: Requirements 5.2, 7.2**
  - Test that theory analysis always invokes Query Agent
  - Generate random theory analysis requests
  - Verify Query Agent is invoked for each request

- [x] 9. Implement Profile Agent with AgentCore
  - Create ProfileAgent class extending AgentCore Agent
  - Register Profile Service tools
  - Implement explicit operation classification (GET, UPDATE, LIST)
  - Implement user isolation (all operations scoped to userId)
  - Add direct tool invocation based on operation type
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 9.1 Write property test for Profile Agent user isolation
  - **Property 6: Profile Agent User Isolation**
  - **Validates: Requirements 4.1, 9.3**
  - Test that all profile operations are scoped to userId
  - Generate random profile operations with different userIds
  - Verify operations never access other users' data

### Phase 3: Implement Tools and Services

- [x] 10. Implement Semantic Search Tool for AgentCore
  - Create SemanticSearchTool class extending AgentCore Tool
  - Define input schema (query, topK, minScore, episodeIds)
  - Implement execute() method calling existing semanticSearch service
  - Add error handling and logging
  - _Requirements: 6.1, 6.2_

- [x] 11. Implement Profile Service Tools for AgentCore
  - Create GetProfileTool class
  - Create UpdateProfileTool class
  - Create ListProfilesTool class
  - Define input schemas for each tool
  - Implement execute() methods calling existing profile service
  - _Requirements: 6.1, 6.2_

- [x] 12. Implement sub-agent invocation utilities
  - Create invokeSubAgent() helper method
  - Implement identity and memory context passing
  - Add execution trace logging
  - Add error handling for sub-agent failures
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 12.1 Write property test for identity propagation
  - **Property 8: Identity Propagation**
  - **Validates: Requirements 7.4, 9.2**
  - Test that UserIdentity is passed to all invoked agents
  - Generate random agent invocations
  - Verify identity is present in all sub-agent calls

### Phase 4: Update Infrastructure

- [x] 13. Remove Bedrock Agents from CDK
  - Remove all CfnAgent constructs from AgentStack
  - Remove CfnAgentAlias constructs
  - Remove agent execution role (will use Lambda roles instead)
  - Clean up agent-related outputs
  - _Requirements: 16.1, 16.2_

- [x] 14. Add AgentCore Lambda functions to CDK
  - Create Gateway Lambda function
  - Create Orchestrator Lambda function
  - Create Query Agent Lambda function
  - Create Theory Agent Lambda function
  - Create Profile Agent Lambda function
  - Configure memory, timeout, and environment variables
  - _Requirements: 1.3, 1.4_

- [x] 15. Configure IAM permissions for AgentCore Lambdas
  - Grant DynamoDB access (profiles, memory, config)
  - Grant S3 access (knowledge base, script data)
  - Grant Bedrock model invocation permissions
  - Grant Lambda invoke permissions (for sub-agents)
  - Grant CloudWatch Logs permissions
  - _Requirements: 6.2, 6.3_

- [x] 16. Update Message Processor to invoke Gateway
  - Replace current custom RAG logic with Gateway invocation
  - Pass userId, sessionId, connectionId to Gateway
  - Handle streaming responses from Gateway
  - Maintain backward compatibility with WebSocketResponse format
  - _Requirements: 8.1, 8.2, 12.1, 12.2_

- [x] 17. Add DynamoDB table for AgentCore Memory (if needed)
  - Check if existing ConversationMemory table is sufficient
  - Add indexes for efficient session retrieval
  - Configure TTL for old sessions
  - _Requirements: 11.1, 11.5_

### Phase 5: Testing and Validation

- [ ]* 18. Write property test for policy enforcement
  - **Property 9: Policy Enforcement**
  - **Validates: Requirements 10.4**
  - Test that requests exceeding rate limits are rejected
  - Generate random request patterns
  - Verify rate limit enforcement

- [ ]* 19. Write property test for memory persistence
  - **Property 10: Memory Persistence**
  - **Validates: Requirements 11.2**
  - Test that all messages are stored in conversation memory
  - Generate random message exchanges
  - Verify all messages are persisted

- [ ]* 20. Write property test for WebSocket format compatibility
  - **Property 11: WebSocket Format Compatibility**
  - **Validates: Requirements 12.2**
  - Test that responses use existing WebSocketResponse format
  - Generate random responses
  - Verify format matches existing structure

- [ ]* 21. Write property test for cost efficiency
  - **Property 12: Cost Efficiency**
  - **Validates: Requirements 13.1**
  - Test that query costs don't exceed $0.001 per query
  - Simulate 100 queries
  - Calculate and verify total cost

- [ ]* 22. Write property test for tool invocation logging
  - **Property 13: Tool Invocation Logging**
  - **Validates: Requirements 14.1**
  - Test that all tool invocations are logged
  - Generate random tool invocations
  - Verify log entries for each invocation

- [ ]* 23. Write property test for Query Agent reliability
  - **Property 14: Query Agent Search Reliability**
  - **Validates: Requirements 15.1**
  - Test that Query Agent invokes search 100 times for 100 queries
  - Generate 100 random queries
  - Verify search is invoked exactly 100 times

- [ ]* 24. Write property test for Orchestrator routing accuracy
  - **Property 15: Orchestrator Routing Accuracy**
  - **Validates: Requirements 15.2**
  - Test that Orchestrator routes 100% correctly
  - Generate queries with known types
  - Verify routing accuracy is 100%

- [ ]* 25. Write property test for response time performance
  - **Property 16: Response Time Performance**
  - **Validates: Requirements 15.5**
  - Test that 90% of queries complete in under 5 seconds
  - Generate 100 random queries
  - Measure and verify response times

- [ ]* 26. Write property test for user data isolation
  - **Property 17: User Data Isolation**
  - **Validates: Requirements 9.3, 9.4, 10.3**
  - Test that users cannot access each other's data
  - Generate operations for multiple users
  - Verify strict data isolation

- [ ]* 27. Write property test for sub-agent registration
  - **Property 18: Sub-Agent Registration**
  - **Validates: Requirements 7.1**
  - Test that Orchestrator registers all sub-agents
  - Create Orchestrator instance
  - Verify Query, Theory, Profile are registered

- [ ]* 28. Write property test for Gateway error handling
  - **Property 19: Gateway Error Handling**
  - **Validates: Requirements 8.4**
  - Test that Gateway returns user-friendly error messages
  - Generate error conditions
  - Verify error messages are user-friendly

- [ ]* 29. Write property test for memory context availability
  - **Property 20: Memory Context Availability**
  - **Validates: Requirements 11.3**
  - Test that conversation memory is accessible to agents
  - Generate agent invocations
  - Verify memory context is available

- [x] 30. Run integration tests for end-to-end flows
  - Test: User query → Gateway → Orchestrator → Query Agent → Response
  - Test: Theory analysis → Theory Agent → Query Agent → Profile update
  - Test: Profile extraction → Profile Agent → DynamoDB
  - Test: Multi-turn conversation with memory
  - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 31. Perform manual testing with real queries
  - Test character queries (e.g., "Tell me about Rena")
  - Test episode queries (e.g., "What happens in Onikakushi?")
  - Test theory analysis (e.g., "Analyze: Rena knows about loops")
  - Test profile operations (e.g., "Show me my character profiles")
  - Verify response quality and citation accuracy
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

### Phase 6: Deployment and Monitoring

- [x] 32. Deploy AgentCore infrastructure
  - Deploy updated CDK stacks (DataStack, AgentStack, APIStack)
  - Verify all Lambda functions are created
  - Verify IAM permissions are correct
  - Test Gateway endpoint
  - _Requirements: 16.4_

- [ ] 33. Configure monitoring and logging
  - Add CloudWatch dashboards for agent metrics
  - Add alarms for error rates
  - Add alarms for response time degradation
  - Add cost tracking for Lambda and Bedrock usage
  - Configure X-Ray tracing for agent coordination
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 34. Validate cost optimization
  - Monitor Lambda execution costs
  - Monitor Bedrock model invocation costs
  - Verify total cost is under $100/month
  - Optimize if needed (reduce memory, use cheaper models)
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 35. Final validation and cleanup
  - Run full test suite (unit, integration, property-based)
  - Verify all requirements are met
  - Remove old Bedrock Agent resources
  - Update documentation
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

## Testing Strategy

### Unit Tests
- Test individual agent methods (classification, routing, tool invocation)
- Test service methods (Identity, Policy, Memory)
- Test tool execute() methods
- Co-located with source files

### Property-Based Tests (fast-check)
- 100+ iterations per property
- Test universal properties across all inputs
- Focus on correctness guarantees
- Located in `packages/backend/test/property/`

### Integration Tests
- Test agent-to-agent communication
- Test Gateway → Orchestrator → Specialized Agent flows
- Test WebSocket streaming end-to-end
- Located in `packages/backend/test/integration/`

## Success Criteria

1. ✅ Query Agent reliably invokes semantic search for 100% of queries
2. ✅ Orchestrator routes to correct agent 100% of the time
3. ✅ All agents use deterministic tool invocation (no autonomous decisions)
4. ✅ Multi-user support with strict data isolation
5. ✅ Response times under 5 seconds for 90% of queries
6. ✅ Total cost under $100/month
7. ✅ All 20 correctness properties validated via property-based tests
8. ✅ Full visibility and debugging capability for agent execution

## Notes

- Tasks marked with `*` are optional testing tasks that can be skipped for faster MVP
- All property-based tests should use fast-check with 100+ iterations
- Each property test must reference the correctness property from the design document
- Focus on deterministic, explicit logic - no autonomous LLM decisions for tool invocation
- Maintain backward compatibility with existing WebSocket infrastructure
