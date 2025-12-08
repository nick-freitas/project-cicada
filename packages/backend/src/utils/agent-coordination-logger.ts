/**
 * Agent Coordination Logging Utilities
 * 
 * Provides specialized logging for agent-to-agent coordination
 * 
 * Requirements:
 * - 13.4: Trace the flow of requests across agents
 */

import { logger } from './logger';

/**
 * Log agent coordination start
 * 
 * Call this when one agent begins invoking another agent
 * 
 * @param sourceAgent - The agent initiating the coordination
 * @param targetAgent - The agent being invoked
 * @param requestId - Optional request ID for tracking
 * @returns A function to call when coordination completes
 */
export function logAgentCoordinationStart(
  sourceAgent: string,
  targetAgent: string,
  requestId?: string
): () => void {
  const startTime = Date.now();
  const coordinationType = `${sourceAgent}-${targetAgent}`;
  const traceId = process.env._X_AMZN_TRACE_ID || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  logger.info('Agent coordination started', {
    sourceAgent,
    targetAgent,
    coordinationType,
    requestId,
    traceId,
    eventType: 'agent_coordination_start',
  });

  // Return a completion function
  return () => {
    const duration = Date.now() - startTime;
    
    logger.logAgentCoordination({
      sourceAgent,
      targetAgent,
      coordinationType,
      duration,
      requestId,
      traceId,
    });
  };
}

/**
 * Log agent coordination with automatic timing
 * 
 * Wraps an agent invocation with coordination logging
 * 
 * @param sourceAgent - The agent initiating the coordination
 * @param targetAgent - The agent being invoked
 * @param invocation - The async function that performs the invocation
 * @param requestId - Optional request ID for tracking
 * @returns The result of the invocation
 */
export async function withAgentCoordinationLogging<T>(
  sourceAgent: string,
  targetAgent: string,
  invocation: () => Promise<T>,
  requestId?: string
): Promise<T> {
  const complete = logAgentCoordinationStart(sourceAgent, targetAgent, requestId);
  
  try {
    const result = await invocation();
    complete();
    return result;
  } catch (error) {
    complete();
    throw error;
  }
}
