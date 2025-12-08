# AgentCore Implementation Tasks

## Implementation Plan

- [x] 1. Set up AgentCore dependencies and infrastructure foundation
  - Install @aws-sdk/client-bedrock-agent-runtime package
  - Install @aws-sdk/client-bedrock-agent package for CDK
  - Research Strands SDK availability and installation (if available as separate package)
  - Update TypeScript types and configurations
  - _Requirements: 1.1, 1.2_

- [x] 2. Create CDK Agent Stack infrastructure
  - Create infrastructure/lib/agent-stack.ts
  - Define IAM roles for agent execution
  - Configure permissions for DynamoDB, S3, Knowledge Base access
  - Set up agent-to-agent invocation permissions
  - Export agent IDs and alias IDs as stack outputs
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. Implement Orchestrator Agent with AgentCore
  - Create agent definition using CDK CfnAgent construct
  - Write agent instructions for query intent analysis
  - Define tools for invoking Query, Theory, and Profile agents
  - Configure foundation model (Nova Lite) and streaming
  - Deploy agent and verify it can be invoked
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 3.1 Write property test for agent invocation consistency
  - **Property 1: Agent Invocation Consistency**
  - **Validates: Requirements 9.1, 9.2**

- [x] 4. Update Message Processor to invoke Orchestrator via AgentCore
  - Modify packages/backend/src/handlers/websocket/message-processor.ts
  - Replace direct Bedrock calls with BedrockAgentRuntimeClient
  - Implement InvokeAgentCommand with streaming
  - Handle streaming response chunks
  - Maintain existing WebSocket message format
  - _Requirements: 7.1, 7.4, 8.1_

- [x] 4.1 Write property test for streaming completeness
  - **Property 2: Streaming Completeness**
  - **Validates: Requirements 8.1, 8.2**

- [ ] 5. Implement Query Agent with AgentCore
  - Create Query Agent definition in CDK
  - Write agent instructions for script search and citation
  - Define tools for Knowledge Base search, citation formatting, nuance analysis
  - Implement tool handlers for semantic search integration
  - Configure foundation model and streaming
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 5.1 Write property test for citation preservation
  - **Property 4: Citation Preservation**
  - **Validates: Requirements 3.4, 9.3**

- [ ] 6. Configure Orchestrator to invoke Query Agent
  - Add invokeQueryAgent tool to Orchestrator
  - Implement tool handler that calls Query Agent via BedrockAgentRuntime
  - Configure permissions for Orchestrator → Query Agent invocation
  - Test agent-to-agent invocation
  - _Requirements: 2.3, 7.2_

- [ ] 6.1 Write property test for agent coordination correctness
  - **Property 3: Agent Coordination Correctness**
  - **Validates: Requirements 2.2, 2.3**

- [ ] 7. Implement Theory Agent with AgentCore
  - Create Theory Agent definition in CDK
  - Write agent instructions for theory analysis
  - Define tools for evidence gathering, profile access, refinement generation
  - Implement tool handler for invoking Query Agent
  - Configure foundation model and streaming
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Configure Orchestrator to invoke Theory Agent
  - Add invokeTheoryAgent tool to Orchestrator
  - Implement tool handler that calls Theory Agent via BedrockAgentRuntime
  - Configure permissions for Orchestrator → Theory Agent invocation
  - Configure permissions for Theory Agent → Query Agent invocation
  - Test multi-hop agent invocation
  - _Requirements: 2.3, 7.2_

- [ ] 9. Implement Profile Agent with AgentCore
  - Create Profile Agent definition in CDK
  - Write agent instructions for knowledge extraction
  - Define tools for profile CRUD operations, information extraction
  - Implement tool handlers for Profile Service integration
  - Configure foundation model (streaming disabled for transactional operations)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 9.1 Write property test for profile update consistency
  - **Property 5: Profile Update Consistency**
  - **Validates: Requirements 5.3, 5.4, 9.4**

- [ ] 10. Configure Orchestrator to invoke Profile Agent
  - Add invokeProfileAgent tool to Orchestrator
  - Implement tool handler that calls Profile Agent via BedrockAgentRuntime
  - Configure permissions for Orchestrator → Profile Agent invocation
  - Test profile extraction and updates through agent coordination
  - _Requirements: 2.3, 7.2_

- [ ] 11. Implement error handling and retry logic
  - Create AgentInvocationError class
  - Implement retry logic with exponential backoff
  - Add error handling for streaming interruptions
  - Implement graceful degradation for agent failures
  - Add comprehensive error logging
  - _Requirements: 7.3_

- [ ] 11.1 Write property test for error recovery
  - **Property 6: Error Recovery**
  - **Validates: Requirements 7.3**

- [ ] 12. Update environment variables and configuration
  - Add ORCHESTRATOR_AGENT_ID to environment
  - Add ORCHESTRATOR_AGENT_ALIAS_ID to environment
  - Add QUERY_AGENT_ID, THEORY_AGENT_ID, PROFILE_AGENT_ID
  - Update CDK to export agent IDs as outputs
  - Update .env.nonprod and .env.prod files
  - _Requirements: 10.4_

- [ ] 13. Checkpoint - Test agent coordination end-to-end
  - Verify Orchestrator can invoke all specialized agents
  - Test streaming responses work correctly
  - Verify citations are preserved
  - Test profile updates work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement monitoring and observability
  - Add CloudWatch metrics for agent invocations
  - Create agent-specific dashboard
  - Implement structured logging for agent calls
  - Add X-Ray tracing for agent coordination
  - Set up alarms for agent errors
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 15. Run all existing property-based tests
  - Run all 30 property test suites
  - Verify all correctness properties still hold
  - Fix any regressions discovered
  - Document any behavioral changes
  - _Requirements: 9.5, 11.1, 11.2, 11.3_

- [ ] 15.1 Write property test for cost efficiency
  - **Property 7: Cost Efficiency**
  - **Validates: Requirements 15.1, 15.2**

- [ ] 15.2 Write property test for response time consistency
  - **Property 8: Response Time Consistency**
  - **Validates: Requirements 8.1, 8.5**

- [ ] 16. Update integration tests for AgentCore
  - Update test/integration/orchestrator.test.ts for AgentCore
  - Update test/integration/knowledge-base.test.ts if needed
  - Add integration tests for agent-to-agent invocation
  - Test streaming with deployed agents
  - _Requirements: 11.2_

- [ ] 17. Performance testing and optimization
  - Measure agent invocation latency
  - Measure token usage per query
  - Optimize agent instructions to reduce tokens
  - Test with concurrent requests
  - Verify cost remains under budget
  - _Requirements: 15.1, 15.2, 15.3, 15.5_

- [ ] 18. Remove prototype Bedrock-direct implementation
  - Delete old agent implementations in packages/backend/src/agents/
  - Remove direct BedrockRuntimeClient usage from agents
  - Update imports and references
  - Clean up unused code
  - _Requirements: 14.4_

- [ ] 19. Update documentation
  - Update architecture diagrams to show AgentCore
  - Document agent invocation patterns
  - Add examples of agent-to-agent calls
  - Document streaming implementation
  - Update README with AgentCore information
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 20. Deploy to nonprod environment
  - Deploy updated CDK stacks to nonprod
  - Verify all agents are created successfully
  - Test end-to-end functionality in nonprod
  - Monitor costs and performance
  - Run smoke tests
  - _Requirements: 14.5_

- [ ] 21. Final validation and testing
  - Run full test suite (unit, integration, property)
  - Verify all correctness properties pass
  - Test all user flows end-to-end
  - Verify cost is under budget
  - Ensure all tests pass, ask the user if questions arise.
