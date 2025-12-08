#!/bin/bash
# Nonprod Deployment Verification Script

set -e

echo "🧪 Verifying Nonprod Deployment"
echo "================================"
echo ""

REGION="us-east-1"
PROFILE="cicada-deployer"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Function to test a component
test_component() {
    local name=$1
    local command=$2
    
    echo -n "Testing $name... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED++))
        return 1
    fi
}

echo "📊 Testing DynamoDB Tables"
echo "-------------------------"
test_component "User Profiles Table" \
    "aws dynamodb describe-table --table-name ProjectCICADADataStack-UserProfiles32DFB678-O2MGGLMVP0S2 --region $REGION --profile $PROFILE"

test_component "Conversation Memory Table" \
    "aws dynamodb describe-table --table-name ProjectCICADADataStack-ConversationMemoryA79C77FF-CV751IQV0D9Q --region $REGION --profile $PROFILE"

test_component "Request Tracking Table" \
    "aws dynamodb describe-table --table-name ProjectCICADADataStack-RequestTrackingCDC37650-1KSHB56TOWWUS --region $REGION --profile $PROFILE"

echo ""
echo "📦 Testing S3 Buckets"
echo "--------------------"
test_component "Knowledge Base Bucket" \
    "aws s3api head-bucket --bucket projectcicadadatastack-knowledgebaseb1c941bd-gmhdx7egxouo --region $REGION --profile $PROFILE"

test_component "Script Data Bucket" \
    "aws s3api head-bucket --bucket projectcicadadatastack-scriptdataf7e49bc5-uqjsdje7v81e --region $REGION --profile $PROFILE"

echo ""
echo "🔐 Testing Cognito"
echo "-----------------"
test_component "User Pool" \
    "aws cognito-idp describe-user-pool --user-pool-id us-east-1_5aZxy0xjl --region $REGION --profile $PROFILE"

test_component "User Pool Client" \
    "aws cognito-idp describe-user-pool-client --user-pool-id us-east-1_5aZxy0xjl --client-id 2j1o52p6vhqp3dguptgpmfvp91 --region $REGION --profile $PROFILE"

echo ""
echo "🌐 Testing API Gateway"
echo "---------------------"
test_component "WebSocket API" \
    "aws apigatewayv2 get-api --api-id 0qqxq435yj --region $REGION --profile $PROFILE"

echo ""
echo "📋 Summary"
echo "=========="
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"
echo -e "📊 Total:  $((PASSED + FAILED))"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All verification tests passed! Deployment is healthy.${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Please review the errors above.${NC}"
    exit 1
fi
