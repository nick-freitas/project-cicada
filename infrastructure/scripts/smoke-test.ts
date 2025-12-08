#!/usr/bin/env ts-node
/**
 * Smoke Test Script for Nonprod Deployment
 * 
 * This script verifies that all critical components are deployed and accessible.
 * 
 * Prerequisites:
 * - AWS credentials configured (AWS_PROFILE environment variable should be set)
 * - AWS CLI installed
 * - Node.js and TypeScript installed
 * 
 * Usage:
 *   AWS_PROFILE=cicada-deployer ts-node infrastructure/scripts/smoke-test.ts
 */

import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { BedrockAgentClient, GetAgentCommand } from '@aws-sdk/client-bedrock-agent';

const REGION = 'us-east-1';

// Agent IDs from deployment
const ORCHESTRATOR_AGENT_ID = 'R0ZBA3I6T8';
const ORCHESTRATOR_AGENT_ALIAS_ID = '5Q53G4PLEU';

// Table names from deployment
const USER_PROFILES_TABLE = 'ProjectCICADADataStack-UserProfiles32DFB678-O2MGGLMVP0S2';
const CONVERSATION_MEMORY_TABLE = 'ProjectCICADADataStack-ConversationMemoryA79C77FF-CV751IQV0D9Q';

// Bucket names from deployment
const KNOWLEDGE_BASE_BUCKET = 'projectcicadadatastack-knowledgebaseb1c941bd-gmhdx7egxouo';
const SCRIPT_BUCKET = 'projectcicadadatastack-scriptdataf7e49bc5-uqjsdje7v81e';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

async function testDynamoDBAccess(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const client = new DynamoDBClient({ region: REGION });
    const command = new ListTablesCommand({});
    const response = await client.send(command);
    
    const hasUserProfiles = response.TableNames?.includes(USER_PROFILES_TABLE);
    const hasConversationMemory = response.TableNames?.includes(CONVERSATION_MEMORY_TABLE);
    
    if (hasUserProfiles && hasConversationMemory) {
      return {
        name: 'DynamoDB Tables',
        status: 'PASS',
        message: 'All required tables exist',
        duration: Date.now() - startTime,
      };
    } else {
      return {
        name: 'DynamoDB Tables',
        status: 'FAIL',
        message: `Missing tables. UserProfiles: ${hasUserProfiles}, ConversationMemory: ${hasConversationMemory}`,
        duration: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      name: 'DynamoDB Tables',
      status: 'FAIL',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testS3Buckets(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const client = new S3Client({ region: REGION });
    
    // Test Knowledge Base bucket
    await client.send(new HeadBucketCommand({ Bucket: KNOWLEDGE_BASE_BUCKET }));
    
    // Test Script bucket
    await client.send(new HeadBucketCommand({ Bucket: SCRIPT_BUCKET }));
    
    return {
      name: 'S3 Buckets',
      status: 'PASS',
      message: 'All required buckets exist and are accessible',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'S3 Buckets',
      status: 'FAIL',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testAgentExists(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const client = new BedrockAgentClient({ region: REGION });
    
    const command = new GetAgentCommand({
      agentId: ORCHESTRATOR_AGENT_ID,
    });
    
    const response = await client.send(command);
    
    if (response.agent && response.agent.agentStatus === 'PREPARED') {
      return {
        name: 'Orchestrator Agent Exists',
        status: 'PASS',
        message: `Agent exists and is in PREPARED status`,
        duration: Date.now() - startTime,
      };
    } else {
      return {
        name: 'Orchestrator Agent Exists',
        status: 'FAIL',
        message: `Agent status: ${response.agent?.agentStatus || 'UNKNOWN'}`,
        duration: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      name: 'Orchestrator Agent Exists',
      status: 'FAIL',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testOrchestratorAgent(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const client = new BedrockAgentRuntimeClient({ region: REGION });
    
    const command = new InvokeAgentCommand({
      agentId: ORCHESTRATOR_AGENT_ID,
      agentAliasId: ORCHESTRATOR_AGENT_ALIAS_ID,
      sessionId: `smoke-test-${Date.now()}`,
      inputText: 'Hello, this is a smoke test.',
    });
    
    const response = await client.send(command);
    
    if (response.completion) {
      return {
        name: 'Orchestrator Agent Invocation',
        status: 'PASS',
        message: 'Agent invoked successfully',
        duration: Date.now() - startTime,
      };
    } else {
      return {
        name: 'Orchestrator Agent Invocation',
        status: 'FAIL',
        message: 'No completion received from agent',
        duration: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      name: 'Orchestrator Agent Invocation',
      status: 'FAIL',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime,
    };
  }
}

async function runSmokeTests() {
  console.log('🧪 Running Nonprod Deployment Smoke Tests\n');
  console.log('=' .repeat(60));
  
  // Test 1: DynamoDB Tables
  console.log('\n📊 Testing DynamoDB Tables...');
  const dynamoResult = await testDynamoDBAccess();
  results.push(dynamoResult);
  console.log(`   ${dynamoResult.status === 'PASS' ? '✅' : '❌'} ${dynamoResult.message} (${dynamoResult.duration}ms)`);
  
  // Test 2: S3 Buckets
  console.log('\n📦 Testing S3 Buckets...');
  const s3Result = await testS3Buckets();
  results.push(s3Result);
  console.log(`   ${s3Result.status === 'PASS' ? '✅' : '❌'} ${s3Result.message} (${s3Result.duration}ms)`);
  
  // Test 3: Agent Exists
  console.log('\n🤖 Testing Orchestrator Agent Exists...');
  const agentExistsResult = await testAgentExists();
  results.push(agentExistsResult);
  console.log(`   ${agentExistsResult.status === 'PASS' ? '✅' : '❌'} ${agentExistsResult.message} (${agentExistsResult.duration}ms)`);
  
  // Test 4: Orchestrator Agent Invocation
  console.log('\n🤖 Testing Orchestrator Agent Invocation...');
  const agentResult = await testOrchestratorAgent();
  results.push(agentResult);
  console.log(`   ${agentResult.status === 'PASS' ? '✅' : '❌'} ${agentResult.message} (${agentResult.duration}ms)`);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Test Summary:');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   📊 Total: ${results.length}`);
  
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  console.log(`   ⏱️  Total Duration: ${totalDuration}ms`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Please review the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed! Deployment is healthy.');
    process.exit(0);
  }
}

// Run the tests
runSmokeTests().catch((error) => {
  console.error('❌ Smoke test execution failed:', error);
  process.exit(1);
});
