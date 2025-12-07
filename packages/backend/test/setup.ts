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
