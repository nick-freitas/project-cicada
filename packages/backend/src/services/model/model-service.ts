/**
 * Model service for managing Bedrock model selection and usage tracking
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ModelConfig, ModelUsageMetrics, BedrockModelId, DEFAULT_MODEL_CONFIGS } from './types';

export class ModelService {
  private bedrockClient: BedrockRuntimeClient;
  private dynamoClient: DynamoDBDocumentClient;
  private modelUsageTable: string;
  private currentConfig: ModelConfig;

  constructor(
    region: string = process.env.AWS_REGION || 'us-east-1',
    modelUsageTable: string = process.env.MODEL_USAGE_TABLE || 'ModelUsage'
  ) {
    this.bedrockClient = new BedrockRuntimeClient({ region });
    
    const ddbClient = new DynamoDBClient({ region });
    this.dynamoClient = DynamoDBDocumentClient.from(ddbClient);
    
    this.modelUsageTable = modelUsageTable;
    
    // Load model config from environment or use default
    this.currentConfig = this.loadModelConfig();
  }

  /**
   * Load model configuration from environment variables
   */
  private loadModelConfig(): ModelConfig {
    const modelId = process.env.MODEL_ID as BedrockModelId;
    const modelPreset = process.env.MODEL_PRESET;

    // If preset is specified, use it
    if (modelPreset && DEFAULT_MODEL_CONFIGS[modelPreset]) {
      return DEFAULT_MODEL_CONFIGS[modelPreset];
    }

    // If specific model ID is provided, use it
    if (modelId) {
      return {
        modelId,
        temperature: parseFloat(process.env.MODEL_TEMPERATURE || '0.7'),
        maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || '2048'),
        topP: parseFloat(process.env.MODEL_TOP_P || '0.9'),
      };
    }

    // Default to Nova Lite
    return DEFAULT_MODEL_CONFIGS['nova-lite'];
  }

  /**
   * Get current model configuration
   */
  getModelConfig(): ModelConfig {
    return { ...this.currentConfig };
  }

  /**
   * Update model configuration
   */
  setModelConfig(config: Partial<ModelConfig>): void {
    this.currentConfig = {
      ...this.currentConfig,
      ...config,
    };
  }

  /**
   * Invoke Bedrock model with the current configuration
   */
  async invokeModel(
    prompt: string,
    systemPrompt?: string,
    overrideConfig?: Partial<ModelConfig>
  ): Promise<{
    response: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }> {
    const startTime = Date.now();
    const config = { ...this.currentConfig, ...overrideConfig };

    // Prepare request based on model family
    const isNova = config.modelId.startsWith('amazon.nova');
    const isClaude = config.modelId.startsWith('anthropic.claude');

    let requestBody: any;
    
    if (isNova) {
      // Nova format
      requestBody = {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          temperature: config.temperature,
          max_new_tokens: config.maxTokens,
          top_p: config.topP,
        },
      };

      if (systemPrompt) {
        requestBody.system = [{ text: systemPrompt }];
      }
    } else if (isClaude) {
      // Claude format
      requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
      };

      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }
    } else {
      throw new Error(`Unsupported model family: ${config.modelId}`);
    }

    const input: InvokeModelCommandInput = {
      modelId: config.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    };

    const command = new InvokeModelCommand(input);
    const response = await this.bedrockClient.send(command);

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const latencyMs = Date.now() - startTime;

    // Extract response text and token counts based on model family
    let responseText: string;
    let inputTokens: number;
    let outputTokens: number;

    if (isNova) {
      responseText = responseBody.output.message.content[0].text;
      inputTokens = responseBody.usage.inputTokens;
      outputTokens = responseBody.usage.outputTokens;
    } else if (isClaude) {
      responseText = responseBody.content[0].text;
      inputTokens = responseBody.usage.input_tokens;
      outputTokens = responseBody.usage.output_tokens;
    } else {
      throw new Error(`Unsupported model family: ${config.modelId}`);
    }

    return {
      response: responseText,
      inputTokens,
      outputTokens,
      latencyMs,
    };
  }

  /**
   * Track model usage for analytics and cost monitoring
   */
  async trackUsage(metrics: Omit<ModelUsageMetrics, 'timestamp'>): Promise<void> {
    const item: ModelUsageMetrics = {
      ...metrics,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.dynamoClient.send(
        new PutCommand({
          TableName: this.modelUsageTable,
          Item: item,
        })
      );
    } catch (error) {
      console.error('Failed to track model usage:', error);
      // Don't throw - usage tracking is non-critical
    }
  }

  /**
   * Invoke model and track usage in one call
   */
  async invokeAndTrack(
    requestId: string,
    userId: string,
    prompt: string,
    systemPrompt?: string,
    agentType?: 'orchestrator' | 'query' | 'theory' | 'profile',
    overrideConfig?: Partial<ModelConfig>
  ): Promise<string> {
    const result = await this.invokeModel(prompt, systemPrompt, overrideConfig);

    await this.trackUsage({
      requestId,
      userId,
      modelId: this.currentConfig.modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      agentType,
    });

    return result.response;
  }
}
