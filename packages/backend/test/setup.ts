// Test setup file
// Set default AWS region for tests
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Set test environment flag
process.env.NODE_ENV = 'test';

// Mock AWS credentials for local testing
if (!process.env.AWS_ACCESS_KEY_ID) {
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
}

// Mock Cognito configuration for tests
if (!process.env.USER_POOL_ID) {
  process.env.USER_POOL_ID = 'us-east-1_TESTPOOL';
  process.env.USER_POOL_CLIENT_ID = 'test-client-id';
}

// Mock DynamoDB table names for tests
if (!process.env.POLICY_TABLE_NAME) {
  process.env.POLICY_TABLE_NAME = 'TestAgentCorePolicies';
  process.env.RATE_LIMIT_TABLE_NAME = 'TestAgentCoreRateLimits';
  process.env.CONVERSATION_MEMORY_TABLE = 'TestConversationMemory';
}
