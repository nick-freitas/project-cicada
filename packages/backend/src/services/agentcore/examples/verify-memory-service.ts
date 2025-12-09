/**
 * Verification script for AgentCore Memory Service
 * 
 * Validates that all requirements from Task 4 are met:
 * - Requirement 11.1: Create conversation history per user/session
 * - Requirement 11.2: Store messages in conversation memory
 * - Requirement 11.3: Provide conversation memory to agents
 * - Requirement 11.4: Compact long conversations
 */

import { memoryService } from '../memory-service';
import { Message } from '../../../agents/types/memory';

async function verifyRequirement11_1() {
  console.log('\n✓ Verifying Requirement 11.1: Create conversation history per user/session');
  
  const userId = 'test-user-1';
  const sessionId = 'test-session-1';
  
  // Get or create session
  const session = await memoryService.getSession(userId, sessionId);
  
  console.log('  ✓ Session created/retrieved successfully');
  console.log(`    - userId: ${session.userId}`);
  console.log(`    - sessionId: ${session.sessionId}`);
  console.log(`    - messages: ${session.messages.length}`);
  console.log(`    - lastAccessed: ${session.lastAccessed}`);
  
  return session.userId === userId && session.sessionId === sessionId;
}

async function verifyRequirement11_2() {
  console.log('\n✓ Verifying Requirement 11.2: Store messages in conversation memory');
  
  const userId = 'test-user-2';
  const sessionId = 'test-session-2';
  
  // Add user message
  const userMessage: Message = {
    role: 'user',
    content: 'Test message for verification',
    timestamp: new Date(),
  };
  
  await memoryService.addMessage(userId, sessionId, userMessage);
  console.log('  ✓ User message stored');
  
  // Add assistant message with metadata
  const assistantMessage: Message = {
    role: 'assistant',
    content: 'Test response',
    timestamp: new Date(),
    metadata: {
      agentName: 'test-agent',
      toolsUsed: ['test-tool'],
      tokenUsage: { input: 10, output: 20 },
    },
  };
  
  await memoryService.addMessage(userId, sessionId, assistantMessage);
  console.log('  ✓ Assistant message with metadata stored');
  
  // Verify messages were stored
  const session = await memoryService.getSession(userId, sessionId);
  console.log(`  ✓ Retrieved ${session.messages.length} messages from memory`);
  
  return session.messages.length === 2;
}

async function verifyRequirement11_3() {
  console.log('\n✓ Verifying Requirement 11.3: Provide conversation memory to agents');
  
  const userId = 'test-user-3';
  const sessionId = 'test-session-3';
  
  // Add some conversation history
  for (let i = 0; i < 5; i++) {
    await memoryService.addMessage(userId, sessionId, {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date(),
    });
  }
  
  // Agent retrieves conversation memory
  const memory = await memoryService.getSession(userId, sessionId);
  
  console.log('  ✓ Agent can access conversation memory');
  console.log(`    - Total messages: ${memory.messages.length}`);
  console.log(`    - Has summary: ${!!memory.summary}`);
  console.log(`    - Last accessed: ${memory.lastAccessed}`);
  
  // Agent can use retrieval options
  const recentMemory = await memoryService.getSession(userId, sessionId, {
    maxMessages: 3,
  });
  
  console.log(`  ✓ Agent can retrieve limited messages: ${recentMemory.messages.length}`);
  
  return memory.messages.length === 5 && recentMemory.messages.length === 3;
}

async function verifyRequirement11_4() {
  console.log('\n✓ Verifying Requirement 11.4: Compact long conversations');
  
  const userId = 'test-user-4';
  const sessionId = 'test-session-4';
  
  // Add many messages to trigger compaction
  console.log('  - Adding 51 messages to trigger auto-compaction...');
  for (let i = 0; i < 51; i++) {
    await memoryService.addMessage(userId, sessionId, {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i} for compaction test`,
      timestamp: new Date(),
    }, {
      autoCompact: true,
      maxMessagesBeforeCompaction: 50,
    });
  }
  
  // Check session after compaction
  const session = await memoryService.getSession(userId, sessionId);
  
  console.log('  ✓ Auto-compaction triggered');
  console.log(`    - Messages after compaction: ${session.messages.length}`);
  console.log(`    - Has summary: ${!!session.summary}`);
  console.log(`    - Summary preview: ${session.summary?.substring(0, 50)}...`);
  
  // Test manual compaction
  const userId2 = 'test-user-5';
  const sessionId2 = 'test-session-5';
  
  for (let i = 0; i < 30; i++) {
    await memoryService.addMessage(userId2, sessionId2, {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date(),
    }, {
      autoCompact: false,
    });
  }
  
  await memoryService.compactSession(userId2, sessionId2);
  const session2 = await memoryService.getSession(userId2, sessionId2);
  
  console.log('  ✓ Manual compaction works');
  console.log(`    - Messages after manual compaction: ${session2.messages.length}`);
  console.log(`    - Has summary: ${!!session2.summary}`);
  
  return session.messages.length <= 11 && !!session.summary && 
         session2.messages.length === 10 && !!session2.summary;
}

async function runVerification() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   AgentCore Memory Service - Requirements Verification    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    const results = {
      req11_1: await verifyRequirement11_1(),
      req11_2: await verifyRequirement11_2(),
      req11_3: await verifyRequirement11_3(),
      req11_4: await verifyRequirement11_4(),
    };
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   Verification Results                                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n  Requirement 11.1 (Session Creation): ${results.req11_1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Requirement 11.2 (Message Storage): ${results.req11_2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Requirement 11.3 (Agent Access): ${results.req11_3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Requirement 11.4 (Compaction): ${results.req11_4 ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = Object.values(results).every(r => r);
    
    if (allPassed) {
      console.log('\n✅ All requirements verified successfully!');
      console.log('\nTask 4: AgentCore Memory Service is COMPLETE ✓\n');
    } else {
      console.log('\n❌ Some requirements failed verification');
    }
    
    return allPassed;
  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    return false;
  }
}

// Run verification if executed directly
if (require.main === module) {
  runVerification()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runVerification };
