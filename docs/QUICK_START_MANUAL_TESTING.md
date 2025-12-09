# Quick Start: Manual Testing

**After AgentCore deployment is complete**, use this guide to quickly run manual tests.

## Prerequisites Check

```bash
# Verify Gateway function exists
aws lambda list-functions --query 'Functions[?contains(FunctionName, `Gateway`)].FunctionName' --output text --no-cli-pager

# Should output: ProjectCICADAAgentStack-GatewayFunction (or similar)
```

If no Gateway function is found, deploy first:
```bash
cd infrastructure && pnpm run deploy
```

## Quick Test (30 seconds)

Run the automated test script:

```bash
./scripts/test-agentcore-manual.sh
```

This will test:
1. Character query ("Tell me about Rena")
2. Episode query ("What happens in Onikakushi?")
3. Theory analysis ("Analyze: Rena knows about the time loops")
4. Profile operations ("Show me my character profiles")

Results are saved to `/tmp/test*-response.json`

## Comprehensive Test (5 minutes)

Run the TypeScript test runner:

```bash
cd scripts
pnpm install  # First time only
pnpm ts-node manual-test-queries.ts
```

This will test 8 scenarios and provide detailed validation.

## Manual Single Test

Test a single query:

```bash
# Get function name
GATEWAY=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `Gateway`)].FunctionName' --output text --no-cli-pager)

# Invoke with your query
aws lambda invoke \
  --function-name "$GATEWAY" \
  --payload '{"query":"Tell me about Rena","userId":"test-user","sessionId":"test-1","connectionId":"manual-test"}' \
  --cli-binary-format raw-in-base64-out \
  response.json

# View response
cat response.json | jq '.'
```

## What to Look For

### ✅ Success Indicators
- Status code: 200
- Response contains content
- Response time < 5 seconds
- Logs show correct agent routing
- Citations are present (for Query Agent)
- No errors in logs

### ❌ Failure Indicators
- Status code: 500 or error
- Empty response
- Response time > 5 seconds
- Wrong agent invoked
- Missing citations
- Errors in logs

## Common Issues

### "Gateway function not found"
→ Deploy the stack: `cd infrastructure && pnpm run deploy`

### "Permission denied" errors
→ Check IAM permissions in CloudWatch Logs

### Slow responses (> 5 seconds)
→ Check Lambda memory allocation (should be 1024MB)
→ Check CloudWatch metrics for cold starts

### Empty responses
→ Check CloudWatch Logs for errors
→ Verify DynamoDB tables exist
→ Verify S3 buckets have data

## View Logs

```bash
# Gateway logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-GatewayFunction --follow --no-cli-pager

# Orchestrator logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-OrchestratorFunction --follow --no-cli-pager

# Query Agent logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-QueryFunction --follow --no-cli-pager
```

## Full Documentation

For complete test scenarios and validation criteria, see:
- `docs/MANUAL_TESTING_PLAN.md` - Comprehensive test plan
- `docs/TASK_31_MANUAL_TESTING_SUMMARY.md` - Task summary

## Report Results

After testing, document results in:
```
docs/MANUAL_TEST_RESULTS.md
```

Include:
- Date/time of testing
- Pass/fail for each test
- Response times
- Any issues observed
- Screenshots or logs

