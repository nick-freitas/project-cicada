# AgentCore Implementation Requirements Document

## Introduction

This specification defines the implementation of CICADA's agent layer using AWS AgentCore with the Strands SDK. The current prototype uses direct Bedrock API calls (`BedrockRuntimeClient` and `ConverseCommand`), but the system design requires using AgentCore for proper multi-agent orchestration, streaming, and coordination. This implementation will align the code with the original architectural design and establish the proper agent platform foundation.

## Glossary

- **AgentCore**: AWS service for building and deploying AI agents with built-in orchestration capabilities
- **Strands SDK**: TypeScript SDK for creating agents with AgentCore
- **Agent**: An AI-powered component that performs specialized tasks (Query, Theory, Profile, Orchestrator)
- **Orchestrator Agent**: Central coordinator that routes queries to specialized agents
- **Query Agent**: Specialized agent for script search and citation
- **Theory Agent**: Specialized agent for theory analysis and validation
- **Profile Agent**: Specialized agent for knowledge extraction and profile management
- **Agent Invocation**: The process of calling one agent from another or from application code
- **Agent Streaming**: Real-time response delivery from agents using streaming protocols
- **Agent Coordination**: The pattern by which the Orchestrator manages multiple specialized agents
- **Bedrock Runtime**: AWS service providing direct access to foundation models
- **Foundation Model**: The underlying AI model (Nova, Maverick) used by agents
- **Agent Handler**: Lambda function that wraps an AgentCore agent for invocation
- **Agent Definition**: CDK construct that defines an AgentCore agent's configuration
- **System**: The CICADA application

## Requirements

### Requirement 1: AgentCore SDK Integration

**User Story:** As a developer, I want to use the Strands SDK to create AgentCore agents, so that the system uses AWS's native agent orchestration platform.

#### Acceptance Criteria

1. WHEN installing dependencies THEN the System SHALL include the Strands SDK TypeScript package
2. WHEN creating an agent THEN the System SHALL use Strands SDK constructs and patterns
3. WHEN an agent is defined THEN the System SHALL configure it with appropriate foundation model settings
4. WHEN deploying agents THEN the System SHALL use CDK constructs for AgentCore agent deployment
5. WHEN agents are invoked THEN the System SHALL use AgentCore's invocation APIs

### Requirement 2: Orchestrator Agent Migration

**User Story:** As a developer, I want the Orchestrator Agent implemented with AgentCore, so that it can properly coordinate specialized agents using native orchestration capabilities.

#### Acceptance Criteria

1. WHEN the Orchestrator Agent is created THEN the System SHALL define it as an AgentCore agent using Strands SDK
2. WHEN the Orchestrator analyzes query intent THEN the System SHALL use the configured foundation model through AgentCore
3. WHEN the Orchestrator invokes specialized agents THEN the System SHALL use AgentCore's agent-to-agent invocation mechanisms
4. WHEN the Orchestrator aggregates responses THEN the System SHALL maintain the existing response format and structure
5. WHEN the Orchestrator streams responses THEN the System SHALL use AgentCore's streaming capabilities

### Requirement 3: Query Agent Migration

**User Story:** As a developer, I want the Query Agent implemented with AgentCore, so that script search and citation functionality uses the agent platform.

#### Acceptance Criteria

1. WHEN the Query Agent is created THEN the System SHALL define it as an AgentCore agent using Strands SDK
2. WHEN the Query Agent performs semantic search THEN the System SHALL maintain integration with the Knowledge Base service
3. WHEN the Query Agent generates responses THEN the System SHALL use the configured foundation model through AgentCore
4. WHEN the Query Agent formats citations THEN the System SHALL maintain the existing citation structure
5. WHEN the Query Agent analyzes nuances THEN the System SHALL preserve the linguistic analysis functionality

### Requirement 4: Theory Agent Migration

**User Story:** As a developer, I want the Theory Agent implemented with AgentCore, so that theory analysis uses the agent platform and can coordinate with other agents.

#### Acceptance Criteria

1. WHEN the Theory Agent is created THEN the System SHALL define it as an AgentCore agent using Strands SDK
2. WHEN the Theory Agent gathers evidence THEN the System SHALL invoke the Query Agent using AgentCore's agent-to-agent invocation
3. WHEN the Theory Agent analyzes theories THEN the System SHALL use the configured foundation model through AgentCore
4. WHEN the Theory Agent identifies profile corrections THEN the System SHALL maintain integration with the Profile service
5. WHEN the Theory Agent generates refinements THEN the System SHALL preserve the existing refinement logic

### Requirement 5: Profile Agent Migration

**User Story:** As a developer, I want the Profile Agent implemented with AgentCore, so that knowledge extraction and profile management uses the agent platform.

#### Acceptance Criteria

1. WHEN the Profile Agent is created THEN the System SHALL define it as an AgentCore agent using Strands SDK
2. WHEN the Profile Agent extracts information THEN the System SHALL use the configured foundation model through AgentCore
3. WHEN the Profile Agent updates profiles THEN the System SHALL maintain integration with the Profile service
4. WHEN the Profile Agent creates profiles THEN the System SHALL preserve the existing profile creation logic
5. WHEN the Profile Agent retrieves profiles THEN the System SHALL maintain the existing retrieval patterns

### Requirement 6: Agent Deployment Infrastructure

**User Story:** As a developer, I want AgentCore agents deployed through CDK, so that infrastructure is managed as code and agents are properly configured.

#### Acceptance Criteria

1. WHEN defining infrastructure THEN the System SHALL use CDK constructs for AgentCore agent deployment
2. WHEN an agent is deployed THEN the System SHALL configure its foundation model, IAM permissions, and environment variables
3. WHEN agents need to invoke each other THEN the System SHALL configure appropriate cross-agent permissions
4. WHEN agents need to access services THEN the System SHALL grant permissions for DynamoDB, S3, and Knowledge Base
5. WHEN infrastructure is synthesized THEN the System SHALL produce valid CloudFormation templates for AgentCore resources

### Requirement 7: Agent Invocation Patterns

**User Story:** As a developer, I want clear patterns for invoking agents, so that the application can interact with AgentCore agents consistently.

#### Acceptance Criteria

1. WHEN the WebSocket handler invokes the Orchestrator THEN the System SHALL use AgentCore's invocation API
2. WHEN the Orchestrator invokes specialized agents THEN the System SHALL use agent-to-agent invocation patterns
3. WHEN an agent invocation fails THEN the System SHALL handle errors gracefully and provide meaningful error messages
4. WHEN invoking agents with streaming THEN the System SHALL use AgentCore's streaming invocation methods
5. WHEN agents return responses THEN the System SHALL maintain the existing response format and structure

### Requirement 8: Streaming Response Migration

**User Story:** As a user, I want real-time streaming responses from agents, so that I can see the agent's thinking as it generates answers.

#### Acceptance Criteria

1. WHEN the Orchestrator streams responses THEN the System SHALL use AgentCore's streaming capabilities
2. WHEN streaming chunks are generated THEN the System SHALL send them to the WebSocket connection
3. WHEN a stream completes THEN the System SHALL send a completion marker
4. WHEN a stream encounters an error THEN the System SHALL send an error marker and handle gracefully
5. WHEN the connection drops during streaming THEN the System SHALL support reconnection and resume using requestId

### Requirement 9: API Contract Preservation

**User Story:** As a developer, I want AgentCore agents to maintain existing API contracts, so that the rest of the system continues to work without changes.

#### Acceptance Criteria

1. WHEN agents are implemented THEN the System SHALL maintain all existing API contracts
2. WHEN responses are generated THEN the System SHALL use the existing response format
3. WHEN citations are provided THEN the System SHALL use the existing citation structure
4. WHEN profiles are updated THEN the System SHALL use the existing profile schema
5. WHEN correctness properties are tested THEN the System SHALL pass all existing property-based tests

### Requirement 10: Agent Configuration

**User Story:** As a developer, I want agents configured with appropriate settings, so that they perform optimally within budget constraints.

#### Acceptance Criteria

1. WHEN an agent is configured THEN the System SHALL specify the foundation model (Nova Lite/Micro or Maverick)
2. WHEN an agent is configured THEN the System SHALL set appropriate timeout values
3. WHEN an agent is configured THEN the System SHALL configure memory and resource limits
4. WHEN an agent is configured THEN the System SHALL set environment variables for service endpoints
5. WHEN agents are deployed THEN the System SHALL maintain cost optimization within the $100/month budget

### Requirement 11: Testing and Validation

**User Story:** As a developer, I want comprehensive tests for AgentCore agents, so that I can verify correctness and catch regressions.

#### Acceptance Criteria

1. WHEN unit tests are written THEN the System SHALL test agent logic with mocked AgentCore SDK calls
2. WHEN integration tests are written THEN the System SHALL test agent invocation with deployed AgentCore agents
3. WHEN property-based tests are run THEN the System SHALL verify all existing correctness properties still hold
4. WHEN agents are tested THEN the System SHALL verify streaming functionality works correctly
5. WHEN agent coordination is tested THEN the System SHALL verify the Orchestrator correctly invokes specialized agents

### Requirement 12: Documentation and Examples

**User Story:** As a developer, I want clear documentation for AgentCore usage, so that I can understand and maintain the agent implementation.

#### Acceptance Criteria

1. WHEN agents are implemented THEN the System SHALL include inline documentation explaining AgentCore patterns
2. WHEN CDK constructs are used THEN the System SHALL document agent deployment configuration
3. WHEN invocation patterns are used THEN the System SHALL provide examples of agent invocation
4. WHEN streaming is implemented THEN the System SHALL document streaming patterns and error handling
5. WHEN the migration is complete THEN the System SHALL update architecture diagrams to reflect AgentCore usage

### Requirement 13: Monitoring and Observability

**User Story:** As a developer, I want visibility into agent performance, so that I can debug issues and optimize behavior.

#### Acceptance Criteria

1. WHEN agents are invoked THEN the System SHALL log invocation details to CloudWatch
2. WHEN agents process requests THEN the System SHALL emit metrics for latency and token usage
3. WHEN agents encounter errors THEN the System SHALL log detailed error information
4. WHEN agents coordinate THEN the System SHALL trace the flow of requests across agents
5. WHEN monitoring dashboards are viewed THEN the System SHALL display agent-specific metrics

### Requirement 14: Incremental Implementation Strategy

**User Story:** As a developer, I want to implement agents incrementally, so that I can validate each agent before moving to the next.

#### Acceptance Criteria

1. WHEN implementing agents THEN the System SHALL allow building and testing agents one at a time
2. WHEN an agent is implemented THEN the System SHALL allow testing it independently
3. WHEN implementation is in progress THEN the System SHALL maintain clear separation between completed and in-progress agents
4. WHEN all agents are implemented THEN the System SHALL remove the prototype Bedrock-direct implementation
5. WHEN implementation is complete THEN the System SHALL verify all functionality works end-to-end with AgentCore

### Requirement 15: Cost Optimization

**User Story:** As a system administrator, I want AgentCore agents to operate within budget, so that the system remains financially sustainable.

#### Acceptance Criteria

1. WHEN agents are configured THEN the System SHALL use cost-effective foundation models (Nova Lite/Micro)
2. WHEN agents process requests THEN the System SHALL optimize token usage through context management
3. WHEN agents are deployed THEN the System SHALL configure appropriate resource limits
4. WHEN monitoring costs THEN the System SHALL track AgentCore-specific costs separately
5. WHEN the system operates THEN the Total Monthly Cost SHALL remain below $100 including AgentCore usage
