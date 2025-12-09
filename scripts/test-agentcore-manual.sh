#!/bin/bash
# Manual Testing Script for AgentCore Migration
# Task 31: Perform manual testing with real queries

set -e

echo "🚀 AgentCore Manual Testing"
echo "Task 31: Perform manual testing with real queries"
echo "Requirements: 15.1, 15.2, 15.3, 15.4, 15.5"
echo ""

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi

# Get Gateway function name
echo "🔍 Finding Gateway Lambda function..."
GATEWAY_FUNCTION=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `Gateway`)].FunctionName' --output text 2>&1 | head -1)

if [ -z "$GATEWAY_FUNCTION" ]; then
    echo "❌ Gateway function not found. Is the stack deployed?"
    echo "Run: cd infrastructure && pnpm run deploy"
    exit 1
fi

echo "✅ Found Gateway function: $GATEWAY_FUNCTION"
echo ""

# Test 1: Character Query - Rena
echo "=========================================="
echo "🧪 TEST 1: Character Query - Rena"
echo "=========================================="
echo "Query: 'Tell me about Rena'"
echo "Expected: Query Agent invocation with citations"
echo ""

PAYLOAD='{"query":"Tell me about Rena","userId":"test-user","sessionId":"test-session-1","connectionId":"manual-test"}'
echo "Invoking Lambda..."
aws lambda invoke \
  --function-name "$GATEWAY_FUNCTION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  /tmp/test1-response.json > /dev/null 2>&1

echo "Response:"
cat /tmp/test1-response.json | jq '.' 2>/dev/null || cat /tmp/test1-response.json
echo ""
echo "✅ Test 1 complete"
echo ""

# Test 2: Episode Query
echo "=========================================="
echo "🧪 TEST 2: Episode Query - Onikakushi"
echo "=========================================="
echo "Query: 'What happens in Onikakushi?'"
echo "Expected: Query Agent with episode-specific search"
echo ""

PAYLOAD='{"query":"What happens in Onikakushi?","userId":"test-user","sessionId":"test-session-2","connectionId":"manual-test"}'
echo "Invoking Lambda..."
aws lambda invoke \
  --function-name "$GATEWAY_FUNCTION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  /tmp/test2-response.json > /dev/null 2>&1

echo "Response:"
cat /tmp/test2-response.json | jq '.' 2>/dev/null || cat /tmp/test2-response.json
echo ""
echo "✅ Test 2 complete"
echo ""

# Test 3: Theory Analysis
echo "=========================================="
echo "🧪 TEST 3: Theory Analysis"
echo "=========================================="
echo "Query: 'Analyze: Rena knows about the time loops'"
echo "Expected: Theory Agent invocation with Query Agent for evidence"
echo ""

PAYLOAD='{"query":"Analyze: Rena knows about the time loops","userId":"test-user","sessionId":"test-session-3","connectionId":"manual-test"}'
echo "Invoking Lambda..."
aws lambda invoke \
  --function-name "$GATEWAY_FUNCTION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  /tmp/test3-response.json > /dev/null 2>&1

echo "Response:"
cat /tmp/test3-response.json | jq '.' 2>/dev/null || cat /tmp/test3-response.json
echo ""
echo "✅ Test 3 complete"
echo ""

# Test 4: Profile Operations
echo "=========================================="
echo "🧪 TEST 4: Profile Operations"
echo "=========================================="
echo "Query: 'Show me my character profiles'"
echo "Expected: Profile Agent invocation with list operation"
echo ""

PAYLOAD='{"query":"Show me my character profiles","userId":"test-user","sessionId":"test-session-4","connectionId":"manual-test"}'
echo "Invoking Lambda..."
aws lambda invoke \
  --function-name "$GATEWAY_FUNCTION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  /tmp/test4-response.json > /dev/null 2>&1

echo "Response:"
cat /tmp/test4-response.json | jq '.' 2>/dev/null || cat /tmp/test4-response.json
echo ""
echo "✅ Test 4 complete"
echo ""

# Summary
echo "=========================================="
echo "📊 TEST SUMMARY"
echo "=========================================="
echo "All 4 manual tests completed"
echo ""
echo "Review the responses above to verify:"
echo "  ✓ Response quality and accuracy"
echo "  ✓ Citation formatting"
echo "  ✓ Agent routing correctness"
echo "  ✓ Response times (should be < 5 seconds)"
echo ""
echo "Temporary response files saved in /tmp/test*-response.json"
echo ""
