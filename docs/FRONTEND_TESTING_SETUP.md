# Frontend Testing Setup Guide

## ✅ Setup Complete!

All necessary updates have been made to enable frontend testing with AgentCore.

## What Was Updated

### 1. Backend Infrastructure ✅
- **AgentStack**: Added Cognito User Pool ID and Client ID to Gateway Lambda
- **Gateway Lambda**: Now has authentication configuration
- **Deployment**: AgentStack redeployed with Cognito integration

### 2. Frontend Configuration ✅
- **Environment File**: Created `packages/frontend/.env.local` with:
  - WebSocket URL: `wss://o4q60fxjna.execute-api.us-east-1.amazonaws.com/prod`
  - REST API URL: `https://pjif1qezjc.execute-api.us-east-1.amazonaws.com/prod/`
  - Cognito User Pool ID: `us-east-1_5aZxy0xjl`
  - Cognito Client ID: `2j1o52p6vhqp3dguptgpmfvp91`

## How to Test the Frontend

### Step 1: Start the Frontend Development Server

```bash
cd packages/frontend
pnpm install  # If not already installed
pnpm run dev
```

The frontend will start on `http://localhost:5173` (or another port if 5173 is busy).

### Step 2: Access the Application

Open your browser and navigate to:
```
http://localhost:5173
```

### Step 3: Login

You'll need to create a user account or use an existing one. The Cognito User Pool is configured with:
- User Pool ID: `us-east-1_5aZxy0xjl`
- Client ID: `2j1o52p6vhqp3dguptgpmfvp91`

**Note**: If you need to create test users, you can do so via AWS Console or AWS CLI:

```bash
# Create a test user
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_5aZxy0xjl \
  --username testuser \
  --user-attributes Name=email,Value=test@example.com \
  --temporary-password TempPass123! \
  --profile cicada-deployer

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_5aZxy0xjl \
  --username testuser \
  --password YourPassword123! \
  --permanent \
  --profile cicada-deployer
```

### Step 4: Test Chat Functionality

Once logged in:

1. **Navigate to Chat Page**: The main chat interface
2. **Send a Test Query**: Try these examples:
   - "Who is Rena?" (should route to Query Agent)
   - "Show me my profiles" (should route to Profile Agent)
   - "Analyze this theory: Rena knows about the loops" (should route to Theory Agent)

3. **Observe Streaming**: Responses should stream in real-time
4. **Check Browser Console**: Look for WebSocket connection logs

### Step 5: Monitor Backend Logs

In another terminal, you can watch the Lambda logs:

```bash
# Watch Gateway Lambda logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Gateway \
  --follow \
  --profile cicada-deployer

# Watch Orchestrator Lambda logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-Orchestrator \
  --follow \
  --profile cicada-deployer

# Watch Query Agent logs
aws logs tail /aws/lambda/ProjectCICADAAgentStack-QueryAgent \
  --follow \
  --profile cicada-deployer
```

## Expected Behavior

### Successful Flow
```
1. User sends message via WebSocket
2. Message goes to WebSocketHandler Lambda
3. Message queued in SQS
4. MessageProcessor picks up message
5. MessageProcessor invokes Gateway Lambda
6. Gateway authenticates user and routes to Orchestrator
7. Orchestrator classifies query and routes to specialized agent
8. Agent processes query with tools
9. Response streams back through WebSocket
10. Frontend displays streaming response
```

### What You Should See

**In Browser Console**:
```
WebSocket connected
Sending message: Who is Rena?
Received chunk: Rena Ryuugu is...
Received chunk: ...a main character...
Received complete
```

**In Lambda Logs**:
```
Gateway: Processing request for user-123
Orchestrator: Classified query as SCRIPT_QUERY
Query Agent: Invoking semantic search
Query Agent: Found 15 results
Query Agent: Formatting response with citations
```

## Troubleshooting

### WebSocket Connection Fails
- Check that `VITE_WEBSOCKET_URL` is correct in `.env.local`
- Verify WebSocket API is deployed: `wss://o4q60fxjna.execute-api.us-east-1.amazonaws.com/prod`
- Check browser console for connection errors

### Authentication Errors
- Verify Cognito User Pool ID and Client ID are correct
- Check that user exists in Cognito User Pool
- Try logging out and logging back in

### No Response from Backend
- Check Lambda logs for errors
- Verify Gateway Lambda has Cognito configuration:
  ```bash
  aws lambda get-function-configuration \
    --function-name ProjectCICADAAgentStack-Gateway \
    --query "Environment.Variables" \
    --profile cicada-deployer
  ```
- Check SQS queue for stuck messages

### Streaming Not Working
- Check that MessageProcessor is processing messages
- Verify WebSocket connection is maintained
- Look for errors in browser console

## Testing Different Agent Types

### Query Agent (Script Search)
```
"Who is Rena?"
"What happens in Onikakushi?"
"Tell me about Oyashiro-sama"
```

### Profile Agent (Profile Management)
```
"Show me my character profiles"
"List all my profiles"
"Show me my theories"
```

### Theory Agent (Theory Analysis)
```
"Analyze this theory: Rena knows about the loops"
"Theory: Satoko is suspicious"
"Validate: Rika can remember previous timelines"
```

## Environment Variables Reference

### Frontend (.env.local)
```bash
VITE_WEBSOCKET_URL=wss://o4q60fxjna.execute-api.us-east-1.amazonaws.com/prod
VITE_API_URL=https://pjif1qezjc.execute-api.us-east-1.amazonaws.com/prod/
VITE_USER_POOL_ID=us-east-1_5aZxy0xjl
VITE_USER_POOL_CLIENT_ID=2j1o52p6vhqp3dguptgpmfvp91
VITE_AWS_REGION=us-east-1
```

### Backend (Configured in CDK)
```bash
GATEWAY_FUNCTION_ARN=arn:aws:lambda:us-east-1:461449807480:function:ProjectCICADAAgentStack-Gateway
USER_POOL_ID=us-east-1_5aZxy0xjl
USER_POOL_CLIENT_ID=2j1o52p6vhqp3dguptgpmfvp91
WEBSOCKET_DOMAIN_NAME=o4q60fxjna.execute-api.us-east-1.amazonaws.com
WEBSOCKET_STAGE=prod
```

## Next Steps After Testing

1. **Verify Agent Behavior**: Ensure agents invoke tools correctly
2. **Test Streaming**: Confirm responses stream smoothly
3. **Check Error Handling**: Test with invalid queries
4. **Monitor Costs**: Watch Lambda invocations and Bedrock usage
5. **Run Integration Tests**: Execute the full test suite

## Support

If you encounter issues:
1. Check Lambda logs in CloudWatch
2. Review browser console for errors
3. Verify environment variables are set correctly
4. Ensure Cognito users are created and active

## Status

✅ **Backend**: Fully deployed with AgentCore
✅ **Frontend**: Environment configured
✅ **Authentication**: Cognito integrated
✅ **WebSocket**: API Gateway configured
✅ **Ready to Test**: All systems operational

You're all set to test the frontend with AgentCore! 🚀
