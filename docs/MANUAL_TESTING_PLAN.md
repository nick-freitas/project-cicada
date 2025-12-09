# Manual Testing Plan for AgentCore Migration

**Task 31**: Perform manual testing with real queries  
**Requirements**: 15.1, 15.2, 15.3, 15.4, 15.5  
**Status**: Ready for execution after deployment

## Prerequisites

Before running manual tests, ensure:

1. ✅ All AgentCore agents are implemented (Tasks 6-9)
2. ✅ Infrastructure code is updated (Tasks 13-17)
3. ❌ **REQUIRED**: AgentCore stack is deployed to AWS
4. ❌ **REQUIRED**: Gateway Lambda function is deployed and accessible

### Deployment Status Check

Run these commands to verify deployment:

```bash
# Check if AgentCore Lambda functions exist
aws lambda list-functions --query 'Functions[?contains(FunctionName, `Gateway`) || contains(FunctionName, `Orchestrator`)].FunctionName' --output table --no-cli-pager

# Expected output should include:
# - ProjectCICADAAgentStack-GatewayFunction
# - ProjectCICADAAgentStack-OrchestratorFunction  
# - ProjectCICADAAgentStack-QueryFunction
# - ProjectCICADAAgentStack-TheoryFunction
# - ProjectCICADAAgentStack-ProfileFunction
```

### Current Deployment State

**As of December 8, 2025:**

The system currently has:
- ✅ Bedrock Agents (old managed service) - still deployed
- ✅ Agent tool functions for Bedrock Agents
- ❌ AgentCore Lambda functions - **NOT YET DEPLOYED**

**Action Required**: Deploy the AgentCore stack before running manual tests:

```bash
cd infrastructure
pnpm run deploy
```

## Test Categories

### 1. Character Queries (Requirement 15.1)

**Purpose**: Validate Query Agent reliably invokes semantic search and returns cited information

#### Test 1.1: Basic Character Query
```json
{
  "query": "Tell me about Rena",
  "userId": "test-user",
  "sessionId": "test-session-1",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Orchestrator routes to Query Agent
- ✅ Query Agent invokes semantic search tool
- ✅ Response includes citations (episode, chapter, message ID)
- ✅ Response is based on script content, not hallucinated
- ✅ Response time < 5 seconds

**Validation Checklist**:
- [ ] Search tool was invoked (check logs)
- [ ] Response contains episode names
- [ ] Response contains chapter IDs
- [ ] Response contains speaker information
- [ ] Citations are properly formatted
- [ ] No hallucinated information

#### Test 1.2: Character with Multiple Appearances
```json
{
  "query": "What do we know about Mion Sonozaki?",
  "userId": "test-user",
  "sessionId": "test-session-2",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Multiple search results from different episodes
- ✅ Citations distinguish between episodes
- ✅ Information is aggregated correctly
- ✅ No mixing of contradictory information from different arcs

#### Test 1.3: Character Relationships
```json
{
  "query": "Describe the relationship between Keiichi and Rena",
  "userId": "test-user",
  "sessionId": "test-session-3",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Search finds relevant passages about both characters
- ✅ Response synthesizes relationship information
- ✅ Citations show where relationship is described

### 2. Episode Queries (Requirement 15.2)

**Purpose**: Validate Query Agent handles episode-specific queries with boundary enforcement

#### Test 2.1: Episode Summary
```json
{
  "query": "What happens in Onikakushi?",
  "userId": "test-user",
  "sessionId": "test-session-4",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Search is scoped to Onikakushi episode
- ✅ Response summarizes key events
- ✅ Citations are all from Onikakushi
- ✅ No information from other arcs

**Validation Checklist**:
- [ ] All citations are from Onikakushi
- [ ] No information from Watanagashi, Tatarigoroshi, etc.
- [ ] Episode boundary is enforced
- [ ] Summary is coherent and accurate

#### Test 2.2: Episode Comparison
```json
{
  "query": "How does Watanagashi differ from Onikakushi?",
  "userId": "test-user",
  "sessionId": "test-session-5",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Search finds information from both episodes
- ✅ Response clearly distinguishes between episodes
- ✅ Citations show which episode each fact comes from
- ✅ Comparison is accurate

#### Test 2.3: Episode-Specific Event
```json
{
  "query": "What happens at the Watanagashi festival?",
  "userId": "test-user",
  "sessionId": "test-session-6",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Search finds festival scenes
- ✅ Response may include multiple episodes (festival appears in multiple arcs)
- ✅ Citations clearly show which episode each description is from

### 3. Theory Analysis (Requirements 15.3, 15.4)

**Purpose**: Validate Theory Agent invokes Query Agent for evidence gathering

#### Test 3.1: Simple Theory
```json
{
  "query": "Analyze: Rena knows about the time loops",
  "userId": "test-user",
  "sessionId": "test-session-7",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Orchestrator routes to Theory Agent
- ✅ Theory Agent invokes Query Agent for evidence
- ✅ Query Agent searches for relevant passages
- ✅ Theory Agent analyzes evidence
- ✅ Response includes supporting and contradicting evidence
- ✅ Theory profile is updated in DynamoDB

**Validation Checklist**:
- [ ] Theory Agent was invoked (check logs)
- [ ] Query Agent was invoked by Theory Agent (check logs)
- [ ] Search tool was invoked (check logs)
- [ ] Response includes evidence analysis
- [ ] Response identifies supporting evidence
- [ ] Response identifies contradicting evidence
- [ ] Theory profile was updated (check DynamoDB)

#### Test 3.2: Complex Theory
```json
{
  "query": "Theory: The curse is actually Hinamizawa Syndrome, a disease",
  "userId": "test-user",
  "sessionId": "test-session-8",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Theory Agent gathers evidence about the curse
- ✅ Theory Agent gathers evidence about disease/syndrome
- ✅ Analysis compares both concepts
- ✅ Response is thorough and evidence-based

#### Test 3.3: Theory Refinement
```json
{
  "query": "Refine my theory about Rika's knowledge",
  "userId": "test-user",
  "sessionId": "test-session-9",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Theory Agent retrieves existing theory from profile
- ✅ Theory Agent gathers new evidence
- ✅ Theory Agent suggests refinements
- ✅ Updated theory is saved to profile

### 4. Profile Operations (Requirement 15.3)

**Purpose**: Validate Profile Agent performs CRUD operations with user isolation

#### Test 4.1: List Profiles
```json
{
  "query": "Show me my character profiles",
  "userId": "test-user",
  "sessionId": "test-session-10",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Orchestrator routes to Profile Agent
- ✅ Profile Agent invokes list profiles tool
- ✅ Response shows only test-user's profiles
- ✅ Response is formatted clearly

**Validation Checklist**:
- [ ] Profile Agent was invoked (check logs)
- [ ] List profiles tool was invoked (check logs)
- [ ] Only test-user's profiles are returned
- [ ] Response is well-formatted

#### Test 4.2: Get Specific Profile
```json
{
  "query": "Get my profile for Rika",
  "userId": "test-user",
  "sessionId": "test-session-11",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Profile Agent invokes get profile tool
- ✅ Response shows Rika profile details
- ✅ Profile is scoped to test-user

#### Test 4.3: Update Profile
```json
{
  "query": "Update my Rena profile: Add that she's protective of her friends",
  "userId": "test-user",
  "sessionId": "test-session-12",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Profile Agent invokes update profile tool
- ✅ Profile is updated in DynamoDB
- ✅ Response confirms update
- ✅ Update is scoped to test-user

#### Test 4.4: User Isolation
```json
# Test with different user
{
  "query": "Show me my character profiles",
  "userId": "different-user",
  "sessionId": "test-session-13",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Response shows only different-user's profiles
- ✅ test-user's profiles are NOT visible
- ✅ User isolation is enforced

### 5. Multi-Turn Conversations (Requirement 15.4)

**Purpose**: Validate conversation memory and context handling

#### Test 5.1: Follow-up Question
```json
# First query
{
  "query": "Tell me about Rena",
  "userId": "test-user",
  "sessionId": "test-session-14",
  "connectionId": "manual-test"
}

# Follow-up query (same session)
{
  "query": "What about her relationship with Keiichi?",
  "userId": "test-user",
  "sessionId": "test-session-14",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Second query understands "her" refers to Rena
- ✅ Conversation memory is maintained
- ✅ Context is used to interpret follow-up

#### Test 5.2: Session Isolation
```json
# Different session, same user
{
  "query": "What about her relationship with Keiichi?",
  "userId": "test-user",
  "sessionId": "test-session-15",
  "connectionId": "manual-test"
}
```

**Expected Behavior**:
- ✅ Query fails or asks for clarification (no context)
- ✅ Sessions are properly isolated
- ✅ Previous session's context is not leaked

### 6. Performance Testing (Requirement 15.5)

**Purpose**: Validate response times meet performance targets

#### Test 6.1: Response Time Measurement

Run all above tests and measure response times:

```bash
# Use the test script with timing
./scripts/test-agentcore-manual.sh
```

**Expected Behavior**:
- ✅ 90% of queries complete in < 5 seconds
- ✅ Simple queries (character, episode) complete in < 3 seconds
- ✅ Complex queries (theory analysis) complete in < 5 seconds

**Validation Checklist**:
- [ ] Measure response time for each test
- [ ] Calculate average response time
- [ ] Calculate 90th percentile response time
- [ ] Verify 90th percentile < 5 seconds

## Running the Tests

### Option 1: Automated Script

```bash
# Make script executable
chmod +x scripts/test-agentcore-manual.sh

# Run all tests
./scripts/test-agentcore-manual.sh

# Review results in /tmp/test*-response.json
```

### Option 2: Manual AWS CLI

```bash
# Get Gateway function name
GATEWAY_FUNCTION=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `Gateway`)].FunctionName' --output text --no-cli-pager)

# Test character query
aws lambda invoke \
  --function-name "$GATEWAY_FUNCTION" \
  --payload '{"query":"Tell me about Rena","userId":"test-user","sessionId":"test-1","connectionId":"manual-test"}' \
  --cli-binary-format raw-in-base64-out \
  response.json

# View response
cat response.json | jq '.'
```

### Option 3: TypeScript Test Runner

```bash
# Install dependencies
cd scripts
pnpm install

# Run TypeScript test script
pnpm ts-node manual-test-queries.ts
```

## Success Criteria

All tests must meet these criteria:

### Requirement 15.1: Query Agent Testing
- ✅ Query Agent reliably invokes semantic search for 100% of queries
- ✅ Responses include proper citations
- ✅ No hallucinated information

### Requirement 15.2: Orchestrator Routing
- ✅ Orchestrator routes to correct agent 100% of the time
- ✅ Character/episode queries → Query Agent
- ✅ Theory queries → Theory Agent
- ✅ Profile queries → Profile Agent

### Requirement 15.3: Profile Agent Testing
- ✅ Profile CRUD operations work correctly
- ✅ User data isolation is enforced
- ✅ Profiles are properly stored in DynamoDB

### Requirement 15.4: Multi-Turn Conversation
- ✅ Conversation memory is maintained within sessions
- ✅ Sessions are properly isolated
- ✅ Context is used for follow-up questions

### Requirement 15.5: Performance
- ✅ 90% of queries complete in < 5 seconds
- ✅ Average response time < 3 seconds
- ✅ No timeouts or failures

## Troubleshooting

### Gateway Function Not Found

**Problem**: `aws lambda list-functions` doesn't show Gateway function

**Solution**:
1. Check if AgentCore stack is deployed:
   ```bash
   aws cloudformation describe-stacks --stack-name ProjectCICADAAgentStack --no-cli-pager
   ```
2. If not deployed, deploy it:
   ```bash
   cd infrastructure
   pnpm run deploy
   ```

### Function Returns Error

**Problem**: Lambda invocation returns error response

**Solution**:
1. Check CloudWatch Logs:
   ```bash
   aws logs tail /aws/lambda/ProjectCICADAAgentStack-GatewayFunction --follow --no-cli-pager
   ```
2. Check function configuration:
   ```bash
   aws lambda get-function --function-name ProjectCICADAAgentStack-GatewayFunction --no-cli-pager
   ```

### Slow Response Times

**Problem**: Queries take > 5 seconds

**Solution**:
1. Check Lambda memory allocation (should be 1024MB)
2. Check if embeddings are loading efficiently (max 3000)
3. Check CloudWatch metrics for cold starts
4. Consider increasing Lambda memory or using provisioned concurrency

## Test Results Documentation

After running tests, document results in:

```
docs/MANUAL_TEST_RESULTS.md
```

Include:
- Date and time of testing
- Test environment (AWS region, account)
- Pass/fail status for each test
- Response times for each test
- Any issues or anomalies observed
- Screenshots or logs of interesting results

## Next Steps

After manual testing is complete:

1. ✅ Mark Task 31 as complete
2. ✅ Document any issues found
3. ✅ Proceed to Task 32: Deploy AgentCore infrastructure
4. ✅ Proceed to Task 33: Configure monitoring and logging
5. ✅ Proceed to Task 34: Validate cost optimization
6. ✅ Proceed to Task 35: Final validation and cleanup

