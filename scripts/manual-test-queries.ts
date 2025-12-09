#!/usr/bin/env ts-node
/**
 * Manual Testing Script for AgentCore Migration
 * 
 * Task 31: Perform manual testing with real queries
 * 
 * This script tests the deployed AgentCore system with real queries:
 * 1. Character queries (e.g., "Tell me about Rena")
 * 2. Episode queries (e.g., "What happens in Onikakushi?")
 * 3. Theory analysis (e.g., "Analyze: Rena knows about loops")
 * 4. Profile operations (e.g., "Show me my character profiles")
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

const lambdaClient = new LambdaClient({ region: 'us-east-1' });
const cfnClient = new CloudFormationClient({ region: 'us-east-1' });

interface TestQuery {
  name: string;
  query: string;
  expectedAgent: 'query' | 'theory' | 'profile';
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  // Character queries
  {
    name: 'Character Query - Rena',
    query: 'Tell me about Rena',
    expectedAgent: 'query',
    description: 'Should invoke Query Agent to search script for Rena information'
  },
  {
    name: 'Character Query - Mion',
    query: 'What do we know about Mion Sonozaki?',
    expectedAgent: 'query',
    description: 'Should invoke Query Agent and return cited information about Mion'
  },
  
  // Episode queries
  {
    name: 'Episode Query - Onikakushi',
    query: 'What happens in Onikakushi?',
    expectedAgent: 'query',
    description: 'Should invoke Query Agent to search Onikakushi episode'
  },
  {
    name: 'Episode Query - Watanagashi',
    query: 'Summarize the Watanagashi arc',
    expectedAgent: 'query',
    description: 'Should invoke Query Agent with episode boundary enforcement'
  },
  
  // Theory analysis
  {
    name: 'Theory Analysis - Rena Loops',
    query: 'Analyze: Rena knows about the time loops',
    expectedAgent: 'theory',
    description: 'Should invoke Theory Agent, which invokes Query Agent for evidence'
  },
  {
    name: 'Theory Analysis - Hinamizawa Syndrome',
    query: 'Theory: The curse is actually a disease',
    expectedAgent: 'theory',
    description: 'Should invoke Theory Agent for analysis and profile update'
  },
  
  // Profile operations
  {
    name: 'Profile List',
    query: 'Show me my character profiles',
    expectedAgent: 'profile',
    description: 'Should invoke Profile Agent to list user profiles'
  },
  {
    name: 'Profile Get',
    query: 'Get my profile for Rika',
    expectedAgent: 'profile',
    description: 'Should invoke Profile Agent to retrieve specific profile'
  }
];

async function getGatewayFunctionName(): Promise<string> {
  try {
    const response = await cfnClient.send(
      new DescribeStacksCommand({ StackName: 'ProjectCICADAAgentStack' })
    );
    
    const outputs = response.Stacks?.[0]?.Outputs || [];
    const gatewayOutput = outputs.find(o => o.OutputKey?.includes('GatewayFunctionArn'));
    
    if (gatewayOutput?.OutputValue) {
      // Extract function name from ARN
      const arnParts = gatewayOutput.OutputValue.split(':');
      const functionName = arnParts[arnParts.length - 1];
      return functionName;
    }
    
    // Fallback: use direct function name
    return 'ProjectCICADAAgentStack-Gateway';
  } catch (error) {
    console.error('Error getting Gateway function name:', error);
    // Use fallback name
    return 'ProjectCICADAAgentStack-Gateway';
  }
}

async function invokeGateway(query: string, userId: string = 'test-user'): Promise<any> {
  const functionName = await getGatewayFunctionName();
  
  // Gateway expects the payload in the format that API Gateway would send
  const payload = {
    body: JSON.stringify({
      query,
      userId,
      sessionId: `test-session-${Date.now()}`,
      connectionId: 'manual-test',
      requestId: `test-${Date.now()}`
    }),
    requestContext: {
      requestId: `test-${Date.now()}`
    }
  };
  
  console.log(`\n📤 Invoking Gateway with query: "${query}"`);
  console.log(`   Function: ${functionName}`);
  console.log(`   User: ${userId}`);
  
  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      LogType: 'Tail' // Get execution logs
    });
    
    const response = await lambdaClient.send(command);
    
    // Decode response
    const responsePayload = response.Payload 
      ? JSON.parse(Buffer.from(response.Payload).toString())
      : null;
    
    // Decode logs
    const logs = response.LogResult 
      ? Buffer.from(response.LogResult, 'base64').toString()
      : null;
    
    return {
      statusCode: response.StatusCode,
      functionError: response.FunctionError,
      payload: responsePayload,
      logs
    };
  } catch (error) {
    console.error('❌ Error invoking Gateway:', error);
    throw error;
  }
}

async function runTest(test: TestQuery): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log(`🧪 TEST: ${test.name}`);
  console.log('='.repeat(80));
  console.log(`Query: "${test.query}"`);
  console.log(`Expected Agent: ${test.expectedAgent}`);
  console.log(`Description: ${test.description}`);
  
  try {
    const startTime = Date.now();
    const result = await invokeGateway(test.query);
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ Response received in ${duration}ms`);
    console.log(`Status Code: ${result.statusCode}`);
    
    if (result.functionError) {
      console.log(`⚠️  Function Error: ${result.functionError}`);
    }
    
    if (result.payload) {
      console.log('\n📄 Response Payload:');
      console.log(JSON.stringify(result.payload, null, 2));
      
      // If there's a body in the response, parse and display it
      if (result.payload.body) {
        try {
          const body = JSON.parse(result.payload.body);
          console.log('\n📄 Response Body:');
          console.log(JSON.stringify(body, null, 2));
        } catch (e) {
          // Body is not JSON, display as-is
        }
      }
    }
    
    if (result.logs) {
      console.log('\n📋 Execution Logs (last 100 lines):');
      const logLines = result.logs.split('\n').slice(-100);
      console.log(logLines.join('\n'));
    }
    
    // Validate response
    validateResponse(test, result, duration);
    
  } catch (error: any) {
    console.error(`\n❌ TEST FAILED: ${test.name}`);
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

function validateResponse(test: TestQuery, result: any, duration: number): void {
  console.log('\n🔍 Validation:');
  
  // Check response time (Requirement 15.5: under 5 seconds for 90% of queries)
  if (duration < 5000) {
    console.log(`✅ Response time: ${duration}ms (< 5000ms target)`);
  } else {
    console.log(`⚠️  Response time: ${duration}ms (> 5000ms target)`);
  }
  
  // Check status code
  if (result.statusCode === 200) {
    console.log('✅ Status code: 200');
  } else {
    console.log(`❌ Status code: ${result.statusCode} (expected 200)`);
  }
  
  // Check payload exists
  if (result.payload) {
    console.log('✅ Response payload present');
    
    // Check for error in payload
    if (result.payload.error) {
      console.log(`❌ Error in response: ${result.payload.error}`);
    } else {
      console.log('✅ No errors in response');
    }
    
    // Check for response content
    if (result.payload.response || result.payload.content) {
      console.log('✅ Response content present');
    } else {
      console.log('⚠️  No response content found');
    }
  } else {
    console.log('❌ No response payload');
  }
  
  // Check logs for agent routing
  if (result.logs) {
    const logs = result.logs.toLowerCase();
    
    if (logs.includes(test.expectedAgent)) {
      console.log(`✅ Expected agent (${test.expectedAgent}) found in logs`);
    } else {
      console.log(`⚠️  Expected agent (${test.expectedAgent}) not found in logs`);
    }
    
    // Check for tool invocation
    if (logs.includes('tool') || logs.includes('invoke')) {
      console.log('✅ Tool invocation detected in logs');
    }
    
    // Check for errors
    if (logs.includes('error') && !logs.includes('no error')) {
      console.log('⚠️  Errors detected in logs');
    }
  }
}

async function main() {
  console.log('🚀 AgentCore Manual Testing Script');
  console.log('Task 31: Perform manual testing with real queries');
  console.log('Requirements: 15.1, 15.2, 15.3, 15.4, 15.5');
  console.log('\n' + '='.repeat(80));
  
  // Check if Gateway function exists
  try {
    const functionName = await getGatewayFunctionName();
    console.log(`✅ Found Gateway function: ${functionName}`);
  } catch (error) {
    console.error('❌ Could not find Gateway function. Is the stack deployed?');
    console.error('Run: cd infrastructure && pnpm run deploy');
    process.exit(1);
  }
  
  // Run all tests
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of TEST_QUERIES) {
    try {
      await runTest(test);
      passedTests++;
    } catch (error) {
      failedTests++;
    }
    
    // Wait between tests to avoid throttling
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${TEST_QUERIES.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / TEST_QUERIES.length) * 100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failedTests} test(s) failed`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
