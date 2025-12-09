/**
 * Sub-Agent Invocation Utilities
 * 
 * Provides utilities for invoking sub-agents with proper identity propagation,
 * memory context passing, execution trace logging, and error handling.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../base';
import { UserIdentity } from '../types/identity';
import { ConversationMemory } from '../types/memory';

/**
 * Sub-agent invocation context
 */
export interface SubAgentInvocationContext {
  /**
   * Name of the calling agent
   */
  callingAgent: string;

  /**
   * Name of the sub-agent being invoked
   */
  subAgentName: string;

  /**
   * User identity (propagated from caller)
   */
  identity: UserIdentity;

  /**
   * Conversation memory (propagated from caller)
   */
  memory: ConversationMemory;

  /**
   * Additional context from caller
   */
  context?: Record<string, any>;

  /**
   * Execution trace ID for tracking agent chains
   */
  traceId?: string;
}

/**
 * Sub-agent invocation result with execution trace
 */
export interface SubAgentInvocationResultWithTrace extends AgentInvocationResult {
  /**
   * Execution trace information
   */
  trace: {
    /**
     * Trace ID for this invocation chain
     */
    traceId: string;

    /**
     * Calling agent name
     */
    callingAgent: string;

    /**
     * Sub-agent name
     */
    subAgentName: string;

    /**
     * Start time of invocation
     */
    startTime: Date;

    /**
     * End time of invocation
     */
    endTime: Date;

    /**
     * Duration in milliseconds
     */
    duration: number;

    /**
     * Whether the invocation succeeded
     */
    success: boolean;

    /**
     * Error message if invocation failed
     */
    error?: string;
  };
}

/**
 * Generate a unique trace ID for execution tracking
 * 
 * Requirement 7.5: Full execution trace logging
 */
function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Log sub-agent invocation for debugging and monitoring
 * 
 * Requirement 7.2: Execution trace logging
 */
function logSubAgentInvocation(
  level: 'info' | 'warn' | 'error',
  message: string,
  context: Partial<SubAgentInvocationContext>,
  metadata?: Record<string, any>
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    callingAgent: context.callingAgent,
    subAgentName: context.subAgentName,
    userId: context.identity?.userId,
    traceId: context.traceId,
    ...metadata,
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Invoke a sub-agent with proper context propagation and error handling
 * 
 * This is the main utility function for agent-to-agent communication.
 * It ensures that:
 * - Identity is propagated (Requirement 7.4)
 * - Memory context is passed (Requirement 7.3)
 * - Execution is traced (Requirement 7.2)
 * - Errors are handled gracefully (Requirement 7.5)
 * 
 * Requirements:
 * - 7.1: Sub-agent registration and invocation
 * - 7.2: Execution trace logging
 * - 7.3: Memory context passing
 * - 7.4: Identity propagation
 * - 7.5: Error handling for sub-agent failures
 * 
 * @param subAgent - The sub-agent instance to invoke
 * @param query - The query to pass to the sub-agent
 * @param context - Invocation context with identity, memory, and caller info
 * @returns Sub-agent invocation result with execution trace
 */
export async function invokeSubAgent(
  subAgent: CICADAAgentBase,
  query: string,
  context: SubAgentInvocationContext
): Promise<SubAgentInvocationResultWithTrace> {
  const startTime = new Date();
  const traceId = context.traceId || generateTraceId();

  // Requirement 7.2: Log sub-agent invocation start
  logSubAgentInvocation(
    'info',
    'Sub-agent invocation started',
    { ...context, traceId },
    {
      query: query.substring(0, 100),
    }
  );

  try {
    // Requirement 7.4: Validate identity before propagation
    if (!context.identity || !context.identity.userId) {
      throw new Error('User identity is required for sub-agent invocation');
    }

    // Requirement 7.3: Validate memory context
    if (!context.memory || !context.memory.sessionId) {
      throw new Error('Conversation memory is required for sub-agent invocation');
    }

    // Requirement 7.1, 7.3, 7.4: Prepare invocation parameters with propagated context
    const invocationParams: AgentInvocationParams = {
      query,
      identity: context.identity, // Requirement 7.4: Identity propagation
      memory: context.memory,     // Requirement 7.3: Memory context passing
      context: {
        ...context.context,
        callingAgent: context.callingAgent,
        traceId,
      },
    };

    // Requirement 7.2: Log invocation parameters
    logSubAgentInvocation(
      'info',
      'Invoking sub-agent with parameters',
      { ...context, traceId },
      {
        hasIdentity: !!invocationParams.identity,
        hasMemory: !!invocationParams.memory,
        messageCount: invocationParams.memory.messages.length,
      }
    );

    // Requirement 7.1: Invoke the sub-agent
    const result = await subAgent.invokeAgent(invocationParams);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Requirement 7.2: Log successful invocation
    logSubAgentInvocation(
      'info',
      'Sub-agent invocation completed successfully',
      { ...context, traceId },
      {
        duration,
        contentLength: result.content?.length || 0,
        agentsInvoked: result.metadata?.agentsInvoked || [],
        toolsUsed: result.metadata?.toolsUsed || [],
      }
    );

    // Requirement 7.5: Return result with execution trace
    return {
      ...result,
      trace: {
        traceId,
        callingAgent: context.callingAgent,
        subAgentName: context.subAgentName,
        startTime,
        endTime,
        duration,
        success: true,
      },
    };
  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Requirement 7.5: Log error
    logSubAgentInvocation(
      'error',
      'Sub-agent invocation failed',
      { ...context, traceId },
      {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    // Requirement 7.5: Return error result with execution trace
    return {
      content: formatSubAgentError(error as Error, context),
      metadata: {
        agentsInvoked: [context.subAgentName],
        toolsUsed: [],
        processingTime: duration,
      },
      trace: {
        traceId,
        callingAgent: context.callingAgent,
        subAgentName: context.subAgentName,
        startTime,
        endTime,
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Format error message for sub-agent failures
 * 
 * Requirement 7.5: User-friendly error messages for sub-agent failures
 */
function formatSubAgentError(error: Error, context: SubAgentInvocationContext): string {
  return `I encountered an error while coordinating with the ${context.subAgentName}. Please try again or rephrase your question.`;
}

/**
 * Invoke multiple sub-agents in sequence
 * 
 * This utility allows an agent to invoke multiple sub-agents in order,
 * passing the result of each to the next. Useful for complex workflows.
 * 
 * Requirements:
 * - 7.1: Sub-agent invocation
 * - 7.2: Execution trace logging
 * - 7.3: Memory context passing
 * - 7.4: Identity propagation
 * - 7.5: Error handling
 * 
 * @param subAgents - Array of sub-agents to invoke in sequence
 * @param initialQuery - Initial query to pass to first sub-agent
 * @param context - Invocation context
 * @returns Array of results from each sub-agent
 */
export async function invokeSubAgentsSequentially(
  subAgents: Array<{ agent: CICADAAgentBase; name: string }>,
  initialQuery: string,
  context: Omit<SubAgentInvocationContext, 'subAgentName'>
): Promise<SubAgentInvocationResultWithTrace[]> {
  const traceId = context.traceId || generateTraceId();
  const results: SubAgentInvocationResultWithTrace[] = [];

  logSubAgentInvocation(
    'info',
    'Starting sequential sub-agent invocation',
    { ...context, traceId, subAgentName: 'sequential' },
    {
      subAgentCount: subAgents.length,
      initialQuery: initialQuery.substring(0, 100),
    }
  );

  let currentQuery = initialQuery;

  for (const { agent, name } of subAgents) {
    try {
      const result = await invokeSubAgent(agent, currentQuery, {
        ...context,
        subAgentName: name,
        traceId,
      });

      results.push(result);

      // If this invocation failed, stop the chain
      if (!result.trace.success) {
        logSubAgentInvocation(
          'warn',
          'Sequential invocation stopped due to sub-agent failure',
          { ...context, traceId, subAgentName: name },
          {
            failedAgent: name,
            completedAgents: results.length - 1,
          }
        );
        break;
      }

      // Use the result as input for the next agent
      currentQuery = result.content;
    } catch (error) {
      logSubAgentInvocation(
        'error',
        'Sequential invocation failed',
        { ...context, traceId, subAgentName: name },
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAgents: results.length,
        }
      );
      break;
    }
  }

  logSubAgentInvocation(
    'info',
    'Sequential sub-agent invocation completed',
    { ...context, traceId, subAgentName: 'sequential' },
    {
      totalAgents: subAgents.length,
      completedAgents: results.length,
      allSuccessful: results.every(r => r.trace.success),
    }
  );

  return results;
}

/**
 * Invoke multiple sub-agents in parallel
 * 
 * This utility allows an agent to invoke multiple sub-agents concurrently,
 * useful when gathering information from multiple sources.
 * 
 * Requirements:
 * - 7.1: Sub-agent invocation
 * - 7.2: Execution trace logging
 * - 7.3: Memory context passing
 * - 7.4: Identity propagation
 * - 7.5: Error handling
 * 
 * @param subAgents - Array of sub-agents to invoke in parallel
 * @param queries - Queries to pass to each sub-agent (must match length of subAgents)
 * @param context - Invocation context
 * @returns Array of results from each sub-agent
 */
export async function invokeSubAgentsInParallel(
  subAgents: Array<{ agent: CICADAAgentBase; name: string }>,
  queries: string[],
  context: Omit<SubAgentInvocationContext, 'subAgentName'>
): Promise<SubAgentInvocationResultWithTrace[]> {
  const traceId = context.traceId || generateTraceId();

  if (subAgents.length !== queries.length) {
    throw new Error('Number of sub-agents must match number of queries');
  }

  logSubAgentInvocation(
    'info',
    'Starting parallel sub-agent invocation',
    { ...context, traceId, subAgentName: 'parallel' },
    {
      subAgentCount: subAgents.length,
    }
  );

  // Invoke all sub-agents in parallel
  const invocationPromises = subAgents.map(({ agent, name }, index) =>
    invokeSubAgent(agent, queries[index], {
      ...context,
      subAgentName: name,
      traceId,
    })
  );

  const results = await Promise.all(invocationPromises);

  logSubAgentInvocation(
    'info',
    'Parallel sub-agent invocation completed',
    { ...context, traceId, subAgentName: 'parallel' },
    {
      totalAgents: subAgents.length,
      successfulAgents: results.filter(r => r.trace.success).length,
      failedAgents: results.filter(r => !r.trace.success).length,
    }
  );

  return results;
}

/**
 * Extract execution trace from sub-agent results
 * 
 * Useful for debugging and monitoring agent chains.
 * 
 * Requirement 7.2: Execution trace logging
 * 
 * @param results - Array of sub-agent invocation results
 * @returns Formatted execution trace
 */
export function extractExecutionTrace(
  results: SubAgentInvocationResultWithTrace[]
): string {
  let trace = 'Execution Trace:\n\n';

  results.forEach((result, index) => {
    trace += `${index + 1}. ${result.trace.callingAgent} → ${result.trace.subAgentName}\n`;
    trace += `   Trace ID: ${result.trace.traceId}\n`;
    trace += `   Duration: ${result.trace.duration}ms\n`;
    trace += `   Success: ${result.trace.success}\n`;

    if (result.trace.error) {
      trace += `   Error: ${result.trace.error}\n`;
    }

    if (result.metadata?.agentsInvoked) {
      trace += `   Agents Invoked: ${result.metadata.agentsInvoked.join(', ')}\n`;
    }

    if (result.metadata?.toolsUsed) {
      trace += `   Tools Used: ${result.metadata.toolsUsed.join(', ')}\n`;
    }

    trace += '\n';
  });

  return trace;
}
