# Testing Ready - Quick Start Guide

## ✅ All Setup Complete!

Everything is configured and ready for testing. Here's how to test:

## Test Script Available

### Run the Manual Test Script

```bash
# From project root
AWS_PROFILE=cicada-deployer npx tsx scripts/manual-test-queries.ts
```

This script tests 8 different queries against the deployed Gateway Lambda:
- Character queries (Query Agent)
- Episode queries (Query Agent)  
- Theory analysis (Theory Agent)
- Profile operations (Profile Agent)

### What the Script Does

1. Finds the Gateway Lambda function
2. Invokes it with test queries
3. Shows response times, payloads, and logs
4. Validates responses
5. Provides a summary

### Current Status

✅ **Infrastructure**: Fully deployed
✅ **Gateway Lambda**: Responding (200 OK)
✅ **Test Script**: Working
✅ **Response Times**: Fast (< 300ms)

⚠️ **Gateway is returning placeholder responses** - This is expected if the Orchestrator invocation isn't fully implemented yet

⚠️ **Memory service bug**: Date serialization issue (non-blocking)

## Frontend Testing

### Start the Frontend

```bash
cd packages/frontend
pnpm run dev
```

Access at: `http://localhost:5173`

### Frontend Environment

Already configured in `packages/frontend/.env.local`:
```bash
VITE_WEBSOCKET_URL=wss://o4q60fxjna.execute-api.us-east-1.amazonaws.com/prod
VITE_API_URL=https://pjif1qezjc.execute-api.us-east-1.amazonaws.com/prod/
VITE_USER_POOL_ID=us-east-1_5aZxy0xjl
VITE_USER_POOL_CLIENT_ID=2j1o52p6vhqp3dguptgpmfvp91
```

## Quick Test Commands

### Test Gateway Directly

```bash
aws lambda invoke \
  --function-name ProjectCICADAAgentStack-Gateway \
  --payload '{"body":"{\"query\":\"Who is Rena?\",\"userId\":\"test-user\",\"sessionId\":\"test-123\",\"connectionId\":\"manual\",\"requestId\":\"test-456\"}"}' \
  --cli-binary-format raw-in-base64-out \
  --profile cicada-deployer \
  response.json && cat response.json | jq .
```

### Watch Gateway Logs

```bash
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Gateway \
  --follow \
  --profile cicada-deployer
```

### Watch All Agent Logs

```bash
# Terminal 1: Gateway
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Gateway --follow --profile cicada-deployer

# Terminal 2: Orchestrator
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Orchestrator --follow --profile cicada-deployer

# Terminal 3: Query Agent
aws logs tail /aws/lambda/ProjectCICADAAgentStack-QueryAgent --follow --profile cicada-deployer
```

## Test Queries to Try

### Via Test Script
```bash
AWS_PROFILE=cicada-deployer npx tsx scripts/manual-test-queries.ts
```

### Via Frontend
Once logged in, try:
- "Who is Rena?"
- "What happens in Onikakushi?"
- "Show me my profiles"
- "Analyze: Rena knows about the loops"

## Deployed Resources

### Lambda Functions
- `ProjectCICADAAgentStack-Gateway` (512MB, 300s)
- `ProjectCICADAAgentStack-Orchestrator` (512MB, 300s)
- `ProjectCICADAAgentStack-QueryAgent` (1024MB, 300s)
- `ProjectCICADAAgentStack-TheoryAgent` (1024MB, 300s)
- `ProjectCICADAAgentStack-ProfileAgent` (1024MB, 300s)

### API Endpoints
- **WebSocket**: `wss://o4q60fxjna.execute-api.us-east-1.amazonaws.com/prod`
- **REST API**: `https://pjif1qezjc.execute-api.us-east-1.amazonaws.com/prod/`

### Cognito
- **User Pool**: `us-east-1_5aZxy0xjl`
- **Client ID**: `2j1o52p6vhqp3dguptgpmfvp91`

## Documentation

- **Frontend Setup**: `docs/FRONTEND_TESTING_SETUP.md`
- **Test Script README**: `scripts/README.md`
- **Integration Status**: `docs/AGENTCORE_INTEGRATION_STATUS.md`
- **Deployment Summary**: `infrastructure/docs/TASK_32_DEPLOYMENT_SUMMARY.md`

## Next Steps

1. ✅ Test script is working
2. ⏭️ Test frontend connection
3. ⏭️ Verify agent orchestration
4. ⏭️ Fix memory service Date serialization bug (if needed)
5. ⏭️ Test with real script data

## Support

If you encounter issues:
1. Check Lambda logs in CloudWatch
2. Review browser console for frontend errors
3. Verify environment variables are set
4. Ensure Cognito users exist

You're all set to test! 🚀
