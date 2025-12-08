/**
 * Utility for creating and configuring AWS Bedrock Agent Runtime clients
 */

import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Create a configured Bedrock Agent Runtime client
 * 
 * @param region AWS region (defaults to us-east-1)
 * @returns Configured BedrockAgentRuntimeClient
 */
export function createAgentRuntimeClient(region: string = 'us-east-1'): BedrockAgentRuntimeClient {
  return new BedrockAgentRuntimeClient({
    region,
    maxAttempts: 3,
  });
}

/**
 * Get agent configuration from environment variables
 * 
 * @param agentType Type of agent (orchestrator, query, theory, profile)
 * @returns Agent ID and Alias ID
 * @throws Error if environment variables are not set
 */
export function getAgentConfig(agentType: 'orchestrator' | 'query' | 'theory' | 'profile'): {
  agentId: string;
  agentAliasId: string;
} {
  const envPrefix = agentType.toUpperCase();
  const agentId = process.env[`${envPrefix}_AGENT_ID`];
  const agentAliasId = process.env[`${envPrefix}_AGENT_ALIAS_ID`];

  if (!agentId || !agentAliasId) {
    throw new Error(
      `Missing environment variables for ${agentType} agent. ` +
      `Required: ${envPrefix}_AGENT_ID and ${envPrefix}_AGENT_ALIAS_ID`
    );
  }

  return { agentId, agentAliasId };
}
