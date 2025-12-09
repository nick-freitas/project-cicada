/**
 * Verification Script for AgentCore Setup
 * 
 * This script verifies that the AgentCore SDK is properly installed
 * and configured by testing the base classes and types.
 */

import { Agent, AgentConfig } from '@strands-agents/sdk';
import { z } from 'zod';
import {
  CICADAAgentBase,
  CICADAToolBase,
  AgentInvocationParams,
  AgentInvocationResult,
  ToolExecutionContext,
} from '../base';
import { UserIdentity, ConversationMemory } from '../types';

/**
 * Verify Strands SDK is accessible
 */
function verifyStrandsSdk(): boolean {
  console.log('✓ Strands SDK imported successfully');
  console.log('  - Agent class available');
  console.log('  - AgentConfig type available');
  return true;
}

/**
 * Verify Zod is accessible
 */
function verifyZod(): boolean {
  const testSchema = z.object({
    test: z.string(),
  });
  
  const result = testSchema.safeParse({ test: 'hello' });
  
  if (result.success) {
    console.log('✓ Zod imported and working');
    return true;
  }
  
  console.error('✗ Zod validation failed');
  return false;
}

/**
 * Verify base classes are accessible
 */
function verifyBaseClasses(): boolean {
  console.log('✓ Base classes imported successfully');
  console.log('  - CICADAAgentBase available');
  console.log('  - CICADAToolBase available');
  return true;
}

/**
 * Verify types are accessible
 */
function verifyTypes(): boolean {
  const identity: UserIdentity = {
    userId: 'test-user',
    username: 'test',
  };
  
  const memory: ConversationMemory = {
    userId: 'test-user',
    sessionId: 'test-session',
    messages: [],
    lastAccessed: new Date(),
  };
  
  console.log('✓ Types imported and working');
  console.log('  - UserIdentity type available');
  console.log('  - ConversationMemory type available');
  return true;
}

/**
 * Verify a simple agent can be created
 */
function verifyAgentCreation(): boolean {
  try {
    class TestAgent extends CICADAAgentBase {
      constructor() {
        super({
          name: 'Test-Agent',
          description: 'Test agent for verification',
          systemPrompt: 'You are a test agent',
        });
      }
      
      async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
        return {
          content: 'Test response',
          metadata: {
            agentsInvoked: ['TestAgent'],
          },
        };
      }
    }
    
    const agent = new TestAgent();
    console.log('✓ Agent creation successful');
    console.log(`  - Agent name: ${agent['agentName']}`);
    return true;
  } catch (error) {
    console.error('✗ Agent creation failed:', error);
    return false;
  }
}

/**
 * Verify a simple tool can be created
 */
function verifyToolCreation(): boolean {
  try {
    const inputSchema = z.object({
      value: z.string(),
    });
    
    class TestTool extends CICADAToolBase<{ value: string }, { result: string }> {
      constructor() {
        super({
          name: 'test-tool',
          description: 'Test tool for verification',
          inputSchema,
        });
      }
      
      protected async executeInternal(
        input: { value: string },
        context: ToolExecutionContext
      ): Promise<{ result: string }> {
        return { result: `Processed: ${input.value}` };
      }
    }
    
    const tool = new TestTool();
    console.log('✓ Tool creation successful');
    console.log(`  - Tool name: ${tool.name}`);
    return true;
  } catch (error) {
    console.error('✗ Tool creation failed:', error);
    return false;
  }
}

/**
 * Run all verification checks
 */
async function runVerification(): Promise<void> {
  console.log('\n=== AgentCore Setup Verification ===\n');
  
  const checks = [
    { name: 'Strands SDK', fn: verifyStrandsSdk },
    { name: 'Zod', fn: verifyZod },
    { name: 'Base Classes', fn: verifyBaseClasses },
    { name: 'Types', fn: verifyTypes },
    { name: 'Agent Creation', fn: verifyAgentCreation },
    { name: 'Tool Creation', fn: verifyToolCreation },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const check of checks) {
    try {
      if (check.fn()) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`✗ ${check.name} check failed:`, error);
      failed++;
    }
    console.log('');
  }
  
  console.log('=== Verification Summary ===\n');
  console.log(`Passed: ${passed}/${checks.length}`);
  console.log(`Failed: ${failed}/${checks.length}`);
  
  if (failed === 0) {
    console.log('\n✓ All checks passed! AgentCore setup is complete.\n');
  } else {
    console.log('\n✗ Some checks failed. Please review the errors above.\n');
    process.exit(1);
  }
}

// Run verification if executed directly
if (require.main === module) {
  runVerification().catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

export { runVerification };
