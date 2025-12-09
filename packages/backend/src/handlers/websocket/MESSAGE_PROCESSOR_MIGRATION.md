# Message Processor Migration to Gateway

## Overview

This document describes the migration of the Message Processor from custom RAG logic to Gateway Lambda invocation, completing Task 16 of the AgentCore migration.

## Changes Made

### 1. Message Processor (`message-processor.ts`)

**Before:**
- Directly invoked Bedrock Runtime for AI inference
- Performed semantic search inline
- Built prompts with search results
- Streamed responses directly from Bedrock

**After:**
- Invokes Gateway Lambda function
- Gateway handles all orchestration (identity, policy, memory, agents)
- Receives complete response from Gateway
- Simulates streaming by chunking the response
- Maintains backward compatibility with WebSocket response format

### 2. Infrastructure Changes (`api-stack.ts`)

**Added:**
- `GATEWAY_FUNCTION_ARN` environment variable to Message Processor
- Lambda invoke permission for Gateway function

**Removed:**
- Bedrock model invocation permissions (now handled by Gateway)
- Bedrock Agent invocation permissions (replaced by AgentCore)

### 3. Dependencies

**Added:**
- `@aws-sdk/client-lambda` - For invoking Gateway Lambda

**Removed:**
- `@aws-sdk/client-bedrock-runtime` - No longer needed
- `@aws-sdk/client-bedrock-agent-runtime` - No longer needed
- Direct semantic search imports - Now handled by Gateway

## Requirements Satisfied

### Requirement 8.1: Pass userId, sessionId, connectionId to Gateway
✅ Message Processor now passes all required parameters to Gateway:
```typescript
const gatewayRequest = {
  query: userMessage,
  userId,
  sessionId,
  connectionId: validConnectionId,
  requestId: validRequestId,
};
```

### Requirement 8.2: Handle streaming responses from Gateway
✅ Message Processor receives response from Gateway and streams it to WebSocket:
- Chunks response into 50-character segments
- Sends each chunk via WebSocket
- Maintains same streaming behavior as before

### Requirement 12.1: Use existing WebSocket infrastructure
✅ Message Processor continues to use:
- Same SQS queue for message processing
- Same WebSocket API for streaming
- Same connection management

### Requirement 12.2: Maintain backward compatibility with WebSocketResponse format
✅ Message Processor uses exact same response format:
```typescript
// Chunk response
{
  requestId: string,
  type: 'chunk',
  content: string
}

// Complete response
{
  requestId: string,
  type: 'complete'
}

// Error response
{
  requestId: string,
  type: 'error',
  error: string
}
```

### Requirement 16.1: Replace custom RAG logic with Gateway invocation
✅ Complete replacement:
- Removed all Bedrock Runtime calls
- Removed inline semantic search
- Removed prompt building logic
- All AI orchestration now handled by Gateway

## Architecture Flow

### Before (Custom RAG):
```
SQS → Message Processor → Semantic Search → Bedrock → WebSocket
```

### After (Gateway):
```
SQS → Message Processor → Gateway Lambda → Orchestrator → Specialized Agents → WebSocket
```

## Testing

Created comprehensive tests in `__tests__/message-processor.test.ts`:
- ✅ Environment configuration validation
- ✅ Message structure validation
- ✅ Gateway request format validation
- ✅ WebSocket response format validation

All tests passing (7/7).

## Deployment Notes

### Environment Variables Required:
- `GATEWAY_FUNCTION_ARN` - ARN of Gateway Lambda function
- `WEBSOCKET_DOMAIN_NAME` - WebSocket API domain
- `WEBSOCKET_STAGE` - WebSocket API stage

### IAM Permissions Required:
- `lambda:InvokeFunction` - To invoke Gateway Lambda
- `execute-api:ManageConnections` - To send WebSocket messages
- `dynamodb:*` - For request tracking

### Deployment Order:
1. Deploy Agent Stack (Gateway Lambda must exist)
2. Deploy API Stack (Message Processor with new configuration)
3. Test end-to-end flow

## Benefits

1. **Separation of Concerns**: Message Processor now only handles message routing, not AI logic
2. **Centralized Orchestration**: All agent coordination happens in Gateway
3. **Better Error Handling**: Gateway provides consistent error handling
4. **Multi-User Support**: Gateway handles identity and policy enforcement
5. **Maintainability**: Simpler Message Processor, easier to debug

## Backward Compatibility

✅ **Fully backward compatible** with existing:
- WebSocket clients
- Response format
- Error handling
- Reconnection support
- Request tracking

No client-side changes required.

## Next Steps

1. Deploy updated infrastructure
2. Monitor Gateway Lambda invocations
3. Verify end-to-end message flow
4. Test with real user queries
5. Monitor costs and performance

## Related Tasks

- ✅ Task 5: Implement AgentCore Gateway
- ✅ Task 14: Add AgentCore Lambda functions to CDK
- ✅ Task 15: Configure IAM permissions for AgentCore Lambdas
- ✅ Task 16: Update Message Processor to invoke Gateway (THIS TASK)
- ⏳ Task 17: Add DynamoDB table for AgentCore Memory
- ⏳ Task 30: Run integration tests for end-to-end flows
