/**
 * AgentCore Memory Service - Usage Examples
 * 
 * This file demonstrates how to use the Memory Service for
 * conversation history management in AgentCore agents.
 */

import { memoryService } from '../memory-service';
import { Message } from '../../../agents/types/memory';

/**
 * Example 1: Basic Session Management
 * 
 * Shows how to get a session, add messages, and retrieve conversation history.
 */
async function basicSessionExample() {
  console.log('\n=== Example 1: Basic Session Management ===\n');

  const userId = 'user-123';
  const sessionId = 'session-abc';

  // Get or create a session
  const session = await memoryService.getSession(userId, sessionId);
  console.log('Session retrieved:', {
    userId: session.userId,
    sessionId: session.sessionId,
    messageCount: session.messages.length,
  });

  // Add a user message
  const userMessage: Message = {
    role: 'user',
    content: 'Tell me about Rena Ryuugu',
    timestamp: new Date(),
  };

  await memoryService.addMessage(userId, sessionId, userMessage);
  console.log('User message added');

  // Add an assistant message
  const assistantMessage: Message = {
    role: 'assistant',
    content: 'Rena Ryuugu is one of the main characters in Higurashi...',
    timestamp: new Date(),
    metadata: {
      agentName: 'query-agent',
      toolsUsed: ['semantic-search'],
      tokenUsage: {
        input: 150,
        output: 300,
      },
    },
  };

  await memoryService.addMessage(userId, sessionId, assistantMessage);
  console.log('Assistant message added');

  // Retrieve updated session
  const updatedSession = await memoryService.getSession(userId, sessionId);
  console.log('Updated session:', {
    messageCount: updatedSession.messages.length,
    lastMessage: updatedSession.messages[updatedSession.messages.length - 1].content.substring(0, 50),
  });
}

/**
 * Example 2: Conversation Context for Agents
 * 
 * Shows how agents access conversation memory for context.
 */
async function agentContextExample() {
  console.log('\n=== Example 2: Conversation Context for Agents ===\n');

  const userId = 'user-456';
  const sessionId = 'session-xyz';

  // Simulate a multi-turn conversation
  const messages: Message[] = [
    {
      role: 'user',
      content: 'What happens in Onikakushi?',
      timestamp: new Date(),
    },
    {
      role: 'assistant',
      content: 'Onikakushi is the first arc of Higurashi...',
      timestamp: new Date(),
    },
    {
      role: 'user',
      content: 'Who is the main character?',
      timestamp: new Date(),
    },
  ];

  // Add messages to session
  for (const message of messages) {
    await memoryService.addMessage(userId, sessionId, message);
  }

  // Agent retrieves conversation memory
  const memory = await memoryService.getSession(userId, sessionId);

  console.log('Agent has access to conversation history:');
  console.log(`- Total messages: ${memory.messages.length}`);
  console.log(`- Last user query: ${memory.messages[memory.messages.length - 1].content}`);
  console.log(`- Previous context available: ${memory.messages.length > 1 ? 'Yes' : 'No'}`);

  // Agent can use this context to provide better responses
  // For example, understanding that "the main character" refers to Onikakushi
}

/**
 * Example 3: Automatic Compaction
 * 
 * Shows how the service automatically compacts long conversations.
 */
async function compactionExample() {
  console.log('\n=== Example 3: Automatic Compaction ===\n');

  const userId = 'user-789';
  const sessionId = 'session-long';

  // Simulate a long conversation (51 messages)
  console.log('Adding 51 messages to trigger compaction...');
  for (let i = 0; i < 51; i++) {
    const message: Message = {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: This is a test message for compaction`,
      timestamp: new Date(),
    };

    await memoryService.addMessage(userId, sessionId, message, {
      autoCompact: true,
      maxMessagesBeforeCompaction: 50,
    });
  }

  // Check session after compaction
  const session = await memoryService.getSession(userId, sessionId);
  console.log('Session after compaction:', {
    messageCount: session.messages.length,
    hasSummary: !!session.summary,
    summaryPreview: session.summary?.substring(0, 100),
  });

  console.log('\nNote: Old messages were summarized, recent messages kept in full');
}

/**
 * Example 4: Manual Compaction
 * 
 * Shows how to manually compact a session.
 */
async function manualCompactionExample() {
  console.log('\n=== Example 4: Manual Compaction ===\n');

  const userId = 'user-manual';
  const sessionId = 'session-manual';

  // Add some messages
  for (let i = 0; i < 30; i++) {
    const message: Message = {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date(),
    };

    await memoryService.addMessage(userId, sessionId, message, {
      autoCompact: false, // Disable auto-compaction
    });
  }

  console.log('Added 30 messages without auto-compaction');

  // Manually trigger compaction
  await memoryService.compactSession(userId, sessionId);
  console.log('Manual compaction completed');

  // Check result
  const session = await memoryService.getSession(userId, sessionId);
  console.log('Session after manual compaction:', {
    messageCount: session.messages.length,
    hasSummary: !!session.summary,
  });
}

/**
 * Example 5: Session Management
 * 
 * Shows how to list and delete sessions.
 */
async function sessionManagementExample() {
  console.log('\n=== Example 5: Session Management ===\n');

  const userId = 'user-mgmt';

  // Create multiple sessions
  const sessionIds = ['session-1', 'session-2', 'session-3'];
  for (const sessionId of sessionIds) {
    await memoryService.addMessage(userId, sessionId, {
      role: 'user',
      content: `Message in ${sessionId}`,
      timestamp: new Date(),
    });
  }

  console.log('Created 3 sessions');

  // List all sessions for user
  const sessions = await memoryService.listSessions(userId);
  console.log(`Found ${sessions.length} sessions for user ${userId}`);

  sessions.forEach((session, index) => {
    console.log(`  ${index + 1}. ${session.sessionId} - ${session.messages.length} messages`);
  });

  // Delete a session
  await memoryService.deleteSession(userId, 'session-2');
  console.log('\nDeleted session-2');

  // List sessions again
  const remainingSessions = await memoryService.listSessions(userId);
  console.log(`Remaining sessions: ${remainingSessions.length}`);
}

/**
 * Example 6: Integration with AgentCore Gateway
 * 
 * Shows how the Gateway uses Memory Service.
 */
async function gatewayIntegrationExample() {
  console.log('\n=== Example 6: Gateway Integration ===\n');

  // Simulated Gateway request
  const request = {
    userId: 'user-gateway',
    sessionId: 'session-gateway',
    query: 'What theories exist about Rika?',
  };

  console.log('Gateway receives request:', request.query);

  // 1. Gateway loads conversation memory
  const memory = await memoryService.getSession(request.userId, request.sessionId);
  console.log(`Loaded conversation memory: ${memory.messages.length} messages`);

  // 2. Gateway passes memory to agent
  console.log('Passing memory to Orchestrator Agent...');
  // const response = await orchestrator.processQuery(request.query, identity, memory);

  // 3. Gateway stores user message
  await memoryService.addMessage(request.userId, request.sessionId, {
    role: 'user',
    content: request.query,
    timestamp: new Date(),
  });
  console.log('User message stored in memory');

  // 4. Gateway stores assistant response
  const mockResponse = 'Based on the script, several theories exist about Rika...';
  await memoryService.addMessage(request.userId, request.sessionId, {
    role: 'assistant',
    content: mockResponse,
    timestamp: new Date(),
    metadata: {
      agentName: 'orchestrator',
      toolsUsed: ['query-agent'],
    },
  });
  console.log('Assistant response stored in memory');

  // 5. Verify memory was updated
  const updatedMemory = await memoryService.getSession(request.userId, request.sessionId);
  console.log(`Memory updated: ${updatedMemory.messages.length} total messages`);
}

/**
 * Example 7: Retrieval Options
 * 
 * Shows how to use retrieval options for memory.
 */
async function retrievalOptionsExample() {
  console.log('\n=== Example 7: Retrieval Options ===\n');

  const userId = 'user-options';
  const sessionId = 'session-options';

  // Add many messages
  for (let i = 0; i < 20; i++) {
    await memoryService.addMessage(userId, sessionId, {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date(),
    });
  }

  // Retrieve only last 5 messages
  const recentMemory = await memoryService.getSession(userId, sessionId, {
    maxMessages: 5,
  });
  console.log(`Retrieved last ${recentMemory.messages.length} messages`);

  // Retrieve without summary
  const memoryNoSummary = await memoryService.getSession(userId, sessionId, {
    includeSummary: false,
  });
  console.log(`Summary included: ${!!memoryNoSummary.summary}`);

  // Retrieve full memory
  const fullMemory = await memoryService.getSession(userId, sessionId);
  console.log(`Full memory: ${fullMemory.messages.length} messages`);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   AgentCore Memory Service - Usage Examples               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await basicSessionExample();
    await agentContextExample();
    await compactionExample();
    await manualCompactionExample();
    await sessionManagementExample();
    await gatewayIntegrationExample();
    await retrievalOptionsExample();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Export examples
export {
  basicSessionExample,
  agentContextExample,
  compactionExample,
  manualCompactionExample,
  sessionManagementExample,
  gatewayIntegrationExample,
  retrievalOptionsExample,
  runAllExamples,
};

// Run examples if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
