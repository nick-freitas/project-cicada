# Requirements Document: Hybrid RAG Orchestration

## Introduction

This spec addresses the issue where Bedrock Agents are not reliably using their defined tools despite explicit instructions. The solution is a hybrid approach that combines custom RAG (Retrieval-Augmented Generation) for script queries with agent-based orchestration for profile and theory operations.

## Glossary

- **Custom RAG**: Direct semantic search + model invocation without relying on agent tool selection
- **Hybrid Orchestration**: System that uses custom RAG for script queries and agents for profile/theory operations
- **Message Processor**: Lambda function that processes user messages and coordinates responses
- **Semantic Search**: Vector similarity search over script embeddings
- **Agent Invocation**: Calling Bedrock Agents (Profile, Theory) for specialized operations

## Requirements

### Requirement 1: Custom RAG for Script Queries

**User Story:** As a user, I want accurate responses about Higurashi script content, so that I can trust the information provided.

#### Acceptance Criteria

1. WHEN a user asks about characters, events, or dialogue, THEN the system SHALL perform semantic search over the script embeddings
2. WHEN semantic search returns results, THEN the system SHALL format them as context for the LLM
3. WHEN the LLM generates a response, THEN the system SHALL base it strictly on the search results
4. WHEN no search results are found, THEN the system SHALL honestly state that no information was found
5. WHEN the response is generated, THEN the system SHALL stream it back to the user via WebSocket

### Requirement 2: Smart Query Classification

**User Story:** As a system, I want to route queries to the appropriate handler, so that each query type gets optimal processing.

#### Acceptance Criteria

1. WHEN a user query is received, THEN the system SHALL classify it as: script-query, profile-request, theory-request, or general
2. WHEN the query is classified as script-query, THEN the system SHALL use custom RAG
3. WHEN the query is classified as profile-request, THEN the system SHALL invoke the Profile Agent
4. WHEN the query is classified as theory-request, THEN the system SHALL invoke the Theory Agent
5. WHEN the query is general, THEN the system SHALL use custom RAG as the default

### Requirement 3: Profile Agent Integration

**User Story:** As a user, I want to access and update character/location profiles, so that I can build knowledge over time.

#### Acceptance Criteria

1. WHEN a user explicitly requests profile information, THEN the system SHALL invoke the Profile Agent
2. WHEN the Profile Agent returns results, THEN the system SHALL stream them to the user
3. WHEN profile operations fail, THEN the system SHALL provide a meaningful error message
4. WHEN profile data is updated, THEN the system SHALL confirm the update to the user

### Requirement 4: Theory Agent Integration

**User Story:** As a user, I want to analyze theories with evidence gathering, so that I can develop and validate narrative hypotheses.

#### Acceptance Criteria

1. WHEN a user requests theory analysis, THEN the system SHALL invoke the Theory Agent
2. WHEN the Theory Agent gathers evidence, THEN it SHALL use custom RAG internally for script searches
3. WHEN theory analysis is complete, THEN the system SHALL stream results to the user
4. WHEN theory operations fail, THEN the system SHALL provide a meaningful error message

### Requirement 5: Cost Optimization

**User Story:** As a system operator, I want to minimize AWS costs, so that the system stays under $100/month budget.

#### Acceptance Criteria

1. WHEN using custom RAG, THEN the system SHALL use direct model invocation (cheaper than agent calls)
2. WHEN loading embeddings, THEN the system SHALL limit to 3000 max for performance
3. WHEN searching, THEN the system SHALL use appropriate topK values (10-20) to minimize processing
4. WHEN streaming responses, THEN the system SHALL use efficient chunking to minimize data transfer
5. WHEN agents are invoked, THEN the system SHALL only invoke them when necessary (not for every query)

### Requirement 6: Response Quality

**User Story:** As a user, I want accurate, well-cited responses, so that I can trust the information.

#### Acceptance Criteria

1. WHEN custom RAG generates a response, THEN it SHALL include episode, chapter, and message citations
2. WHEN search results are used, THEN the response SHALL reference specific passages
3. WHEN no evidence is found, THEN the system SHALL not hallucinate information
4. WHEN multiple episodes are relevant, THEN the system SHALL maintain episode boundaries
5. WHEN speakers are identified, THEN the system SHALL include speaker names in citations

### Requirement 7: Backward Compatibility

**User Story:** As a developer, I want the new system to work with existing infrastructure, so that deployment is smooth.

#### Acceptance Criteria

1. WHEN the hybrid system is deployed, THEN it SHALL use existing WebSocket infrastructure
2. WHEN responses are sent, THEN they SHALL use existing WebSocketResponse format
3. WHEN errors occur, THEN they SHALL use existing error handling patterns
4. WHEN the system processes messages, THEN it SHALL use existing SQS queue
5. WHEN embeddings are loaded, THEN it SHALL use existing S3 bucket structure

### Requirement 8: Monitoring and Logging

**User Story:** As a system operator, I want comprehensive logging, so that I can debug issues and monitor performance.

#### Acceptance Criteria

1. WHEN a query is classified, THEN the system SHALL log the classification decision
2. WHEN semantic search is performed, THEN the system SHALL log result count and top score
3. WHEN agents are invoked, THEN the system SHALL log agent ID and invocation time
4. WHEN responses are generated, THEN the system SHALL log response length and duration
5. WHEN errors occur, THEN the system SHALL log detailed error information

### Requirement 9: Graceful Degradation

**User Story:** As a user, I want the system to handle failures gracefully, so that I get useful feedback even when things go wrong.

#### Acceptance Criteria

1. WHEN semantic search fails, THEN the system SHALL fall back to a general response
2. WHEN agent invocation fails, THEN the system SHALL retry up to 3 times
3. WHEN all retries fail, THEN the system SHALL provide a user-friendly error message
4. WHEN streaming is interrupted, THEN the system SHALL handle reconnection
5. WHEN the system is overloaded, THEN it SHALL queue messages appropriately

### Requirement 10: Testing and Validation

**User Story:** As a developer, I want to validate the hybrid system works correctly, so that I can deploy with confidence.

#### Acceptance Criteria

1. WHEN the system is tested with character queries, THEN it SHALL return accurate, cited information
2. WHEN the system is tested with profile requests, THEN it SHALL correctly invoke the Profile Agent
3. WHEN the system is tested with theory requests, THEN it SHALL correctly invoke the Theory Agent
4. WHEN the system is tested with edge cases, THEN it SHALL handle them gracefully
5. WHEN performance is measured, THEN response times SHALL be under 5 seconds for 90% of queries
