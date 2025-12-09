# Manual Testing Scripts

## Quick Test Script

### `manual-test-queries.ts`

Tests the deployed AgentCore system with real queries to verify agent routing and tool invocation.

### Prerequisites

1. **AgentCore infrastructure deployed**:
   ```bash
   cd infrastructure
   pnpm run deploy
   ```

2. **AWS credentials configured** with profile `cicada-deployer` or default credentials

3. **Dependencies installed**:
   ```bash
   pnpm install
   ```

### Running the Tests

From the project root:

```bash
# Run all test queries
pnpm exec ts-node scripts/manual-test-queries.ts

# Or with npx
npx ts-node scripts/manual-test-queries.ts
```

### What It Tests

The script tests 8 different query types:

1. **Character Queries** (Query Agent):
   - "Tell me about Rena"
   - "What do we know about Mion Sonozaki?"

2. **Episode Queries** (Query Agent):
   - "What happens in Onikakushi?"
   - "Summarize the Watanagashi arc"

3. **Theory Analysis** (Theory Agent):
   - "Analyze: Rena knows about the time loops"
   - "Theory: The curse is actually a disease"

4. **Profile Operations** (Profile Agent):
   - "Show me my character profiles"
   - "Get my profile for Rika"

### Expected Output

For each test, you'll see:

```
🧪 TEST: Character Query - Rena
================================================================================
Query: "Tell me about Rena"
Expected Agent: query
Description: Should invoke Query Agent to search script for Rena information

📤 Invoking Gateway with query: "Tell me about Rena"
   Function: ProjectCICADAAgentStack-Gateway
   User: test-user

✅ Response received in 2341ms
Status Code: 200

📄 Response Payload:
{
  "statusCode": 200,
  "body": "{\"content\":\"Rena Ryuugu is...\"}"
}

📋 Execution Logs:
START RequestId: abc-123
Gateway: Processing request for test-user
Orchestrator: Classified query as SCRIPT_QUERY
Query Agent: Invoking semantic search
...

🔍 Validation:
✅ Response time: 2341ms (< 5000ms target)
✅ Status code: 200
✅ Response payload present
✅ No errors in response
✅ Response content present
✅ Expected agent (query) found in logs
✅ Tool invocation detected in logs
```

### Test Summary

At the end, you'll see:

```
📊 TEST SUMMARY
================================================================================
Total Tests: 8
Passed: 8
Failed: 0
Success Rate: 100.0%

✅ All tests passed!
```

### Troubleshooting

**Error: Could not find Gateway function**
- Ensure AgentStack is deployed: `cd infrastructure && pnpm run deploy`
- Check stack name is correct: `ProjectCICADAAgentStack`

**Error: AccessDeniedException**
- Verify AWS credentials are configured
- Check IAM permissions for Lambda invoke

**Error: Function returned error**
- Check Lambda logs: `aws logs tail /aws/lambda/ProjectCICADAAgentStack-Gateway --follow`
- Verify environment variables are set correctly
- Check Cognito User Pool ID is configured

**Slow response times (> 5 seconds)**
- Check Lambda cold start times
- Verify Bedrock model availability
- Check DynamoDB and S3 access

### Manual Single Query Test

To test a single query manually:

```bash
# Test Query Agent
aws lambda invoke \
  --function-name ProjectCICADAAgentStack-Gateway \
  --payload '{"body":"{\"query\":\"Who is Rena?\",\"userId\":\"test-user\",\"sessionId\":\"test-123\",\"connectionId\":\"manual\",\"requestId\":\"test-456\"}"}' \
  --cli-binary-format raw-in-base64-out \
  response.json

# View response
cat response.json | jq .
```

### Monitoring Logs

Watch Lambda logs in real-time:

```bash
# Gateway logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Gateway --follow

# Orchestrator logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Orchestrator --follow

# Query Agent logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-QueryAgent --follow

# Theory Agent logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-TheoryAgent --follow

# Profile Agent logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-ProfileAgent --follow
```

### Requirements Validated

This script validates:
- **15.1**: Query Agent reliably invokes search and returns cited information
- **15.2**: Orchestrator routes to correct agent 100% of the time
- **15.3**: Profile Agent correctly performs CRUD operations
- **15.4**: Theory Agent correctly invokes Query Agent for evidence
- **15.5**: Response times under 5 seconds for 90% of queries

### Next Steps

After running tests:
1. Review test results and validation output
2. Check CloudWatch logs for detailed execution traces
3. Verify agent routing is correct
4. Confirm tool invocation is deterministic
5. Test with frontend application
