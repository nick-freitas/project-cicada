/**
 * Example usage of PolicyService
 * 
 * Demonstrates how to use the AgentCore Policy service for:
 * - Loading user policies
 * - Enforcing access control
 * - Managing rate limits
 * - Creating custom policies
 */

import { policyService, AgentPolicy } from '../policy-service';

/**
 * Example 1: Get user policy (default or custom)
 */
async function example1_GetPolicy() {
  console.log('\n=== Example 1: Get User Policy ===\n');

  // Get policy for a user (returns default if no custom policy exists)
  const policy = await policyService.getPolicy('user123');

  console.log('User Policy:');
  console.log(`  User ID: ${policy.userId}`);
  console.log(`  Allowed Agents: ${policy.allowedAgents.join(', ')}`);
  console.log(`  Data Isolation: ${policy.dataIsolation}`);
  console.log(`  Max Tokens: ${policy.maxTokens}`);
  console.log(`  Rate Limit: ${policy.rateLimit} requests/hour`);
}

/**
 * Example 2: Enforce policy on a request
 */
async function example2_EnforcePolicy() {
  console.log('\n=== Example 2: Enforce Policy ===\n');

  const policy = await policyService.getPolicy('user123');

  // Check if user can access Query Agent
  const result1 = await policyService.enforcePolicy(policy, {
    userId: 'user123',
    agentName: 'query',
  });

  console.log('Query Agent Access:');
  console.log(`  Allowed: ${result1.allowed}`);
  console.log(`  Remaining Requests: ${result1.remainingRequests}`);

  // Try to access an agent not in allowedAgents
  const restrictedPolicy: AgentPolicy = {
    ...policy,
    allowedAgents: ['orchestrator'], // Only orchestrator allowed
  };

  const result2 = await policyService.enforcePolicy(restrictedPolicy, {
    userId: 'user123',
    agentName: 'query',
  });

  console.log('\nRestricted Agent Access:');
  console.log(`  Allowed: ${result2.allowed}`);
  console.log(`  Reason: ${result2.reason}`);
}

/**
 * Example 3: Data isolation enforcement
 */
async function example3_DataIsolation() {
  console.log('\n=== Example 3: Data Isolation ===\n');

  const policy = await policyService.getPolicy('user123');

  // Try to access own data (should succeed)
  const result1 = await policyService.enforcePolicy(policy, {
    userId: 'user123',
    agentName: 'profile',
    targetUserId: 'user123', // Same user
  });

  console.log('Access Own Data:');
  console.log(`  Allowed: ${result1.allowed}`);

  // Try to access another user's data with strict isolation (should fail)
  const result2 = await policyService.enforcePolicy(policy, {
    userId: 'user123',
    agentName: 'profile',
    targetUserId: 'user456', // Different user
  });

  console.log('\nAccess Other User Data (Strict):');
  console.log(`  Allowed: ${result2.allowed}`);
  console.log(`  Reason: ${result2.reason}`);

  // Try with shared isolation (should succeed)
  const sharedPolicy: AgentPolicy = {
    ...policy,
    dataIsolation: 'shared',
  };

  const result3 = await policyService.enforcePolicy(sharedPolicy, {
    userId: 'user123',
    agentName: 'profile',
    targetUserId: 'user456',
  });

  console.log('\nAccess Other User Data (Shared):');
  console.log(`  Allowed: ${result3.allowed}`);
}

/**
 * Example 4: Rate limiting
 */
async function example4_RateLimiting() {
  console.log('\n=== Example 4: Rate Limiting ===\n');

  const policy: AgentPolicy = {
    userId: 'user789',
    allowedAgents: ['query'],
    dataIsolation: 'strict',
    maxTokens: 2048,
    rateLimit: 5, // Very low limit for demo
  };

  // Make several requests
  for (let i = 1; i <= 7; i++) {
    const result = await policyService.enforcePolicy(policy, {
      userId: 'user789',
      agentName: 'query',
    });

    console.log(`Request ${i}:`);
    console.log(`  Allowed: ${result.allowed}`);
    console.log(`  Remaining: ${result.remainingRequests}`);
    if (result.reason) {
      console.log(`  Reason: ${result.reason}`);
    }

    // Stop if rate limited
    if (!result.allowed) {
      break;
    }
  }

  // Reset rate limit
  console.log('\nResetting rate limit...');
  await policyService.resetRateLimit('user789');
  console.log('Rate limit reset successfully');
}

/**
 * Example 5: Create custom policy
 */
async function example5_CustomPolicy() {
  console.log('\n=== Example 5: Create Custom Policy ===\n');

  // Create a custom policy for a power user
  const customPolicy: AgentPolicy = {
    userId: 'poweruser',
    allowedAgents: ['orchestrator', 'query', 'theory', 'profile'],
    dataIsolation: 'shared', // Can access shared data
    maxTokens: 4096, // Higher token limit
    rateLimit: 500, // Higher rate limit
    customPermissions: {
      canExportData: true,
      canViewAnalytics: true,
    },
  };

  await policyService.savePolicy(customPolicy);
  console.log('Custom policy created for poweruser');

  // Retrieve and verify
  const retrieved = await policyService.getPolicy('poweruser');
  console.log('\nRetrieved Policy:');
  console.log(`  User ID: ${retrieved.userId}`);
  console.log(`  Allowed Agents: ${retrieved.allowedAgents.join(', ')}`);
  console.log(`  Data Isolation: ${retrieved.dataIsolation}`);
  console.log(`  Max Tokens: ${retrieved.maxTokens}`);
  console.log(`  Rate Limit: ${retrieved.rateLimit}`);
  console.log(`  Custom Permissions: ${JSON.stringify(retrieved.customPermissions)}`);
}

/**
 * Example 6: Gateway integration pattern
 */
async function example6_GatewayIntegration() {
  console.log('\n=== Example 6: Gateway Integration Pattern ===\n');

  // Simulate a request coming through the Gateway
  const userId = 'user123';
  const agentName = 'query';

  console.log('Incoming request:');
  console.log(`  User: ${userId}`);
  console.log(`  Agent: ${agentName}`);

  // 1. Load policy
  const policy = await policyService.getPolicy(userId);
  console.log('\nPolicy loaded');

  // 2. Enforce policy
  const enforcement = await policyService.enforcePolicy(policy, {
    userId,
    agentName,
  });

  console.log('\nPolicy enforcement:');
  console.log(`  Allowed: ${enforcement.allowed}`);
  console.log(`  Remaining Requests: ${enforcement.remainingRequests}`);

  if (!enforcement.allowed) {
    console.log(`  Reason: ${enforcement.reason}`);
    console.log('\nRequest rejected');
    return;
  }

  // 3. Proceed with agent invocation
  console.log('\nProceeding with agent invocation...');
  console.log('(Agent would be invoked here)');
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('PolicyService Examples');
  console.log('======================');

  try {
    await example1_GetPolicy();
    await example2_EnforcePolicy();
    await example3_DataIsolation();
    await example4_RateLimiting();
    await example5_CustomPolicy();
    await example6_GatewayIntegration();

    console.log('\n=== All Examples Completed ===\n');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run examples if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  example1_GetPolicy,
  example2_EnforcePolicy,
  example3_DataIsolation,
  example4_RateLimiting,
  example5_CustomPolicy,
  example6_GatewayIntegration,
};
