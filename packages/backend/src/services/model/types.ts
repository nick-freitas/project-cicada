/**
 * Model service types
 */

export type BedrockModelId = 
  | 'amazon.nova-lite-v1:0'
  | 'amazon.nova-micro-v1:0'
  | 'amazon.nova-pro-v1:0'
  | 'anthropic.claude-3-sonnet-20240229-v1:0'
  | 'anthropic.claude-3-haiku-20240307-v1:0';

export interface ModelConfig {
  modelId: BedrockModelId;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface ModelUsageMetrics {
  requestId: string;
  userId: string;
  modelId: BedrockModelId;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  timestamp: string;
  agentType?: 'orchestrator' | 'query' | 'theory' | 'profile';
}

export const DEFAULT_MODEL_CONFIGS: Record<string, ModelConfig> = {
  'nova-lite': {
    modelId: 'amazon.nova-lite-v1:0',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
  },
  'nova-micro': {
    modelId: 'amazon.nova-micro-v1:0',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
  },
  'nova-pro': {
    modelId: 'amazon.nova-pro-v1:0',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
  },
  'claude-sonnet': {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
  },
  'claude-haiku': {
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
  },
};
