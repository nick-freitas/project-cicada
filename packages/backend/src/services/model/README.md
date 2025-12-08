# Model Service

The Model Service provides a unified interface for managing Bedrock model selection, invocation, and usage tracking.

## Features

- **Model Selection**: Switch between Nova and Maverick (Claude) models
- **Configuration Management**: Environment-based model configuration
- **Usage Tracking**: Track token usage and latency per request
- **Cost Monitoring**: Store usage metrics for cost analysis

## Supported Models

### Nova Models (Amazon)
- **nova-lite**: `amazon.nova-lite-v1:0` - Lightweight, cost-effective
- **nova-micro**: `amazon.nova-micro-v1:0` - Ultra-lightweight
- **nova-pro**: `amazon.nova-pro-v1:0` - High-performance

### Maverick Models (Anthropic Claude)
- **claude-sonnet**: `anthropic.claude-3-sonnet-20240229-v1:0` - Balanced performance
- **claude-haiku**: `anthropic.claude-3-haiku-20240307-v1:0` - Fast and efficient

## Configuration

### Environment Variables

```bash
# Option 1: Use preset (recommended)
MODEL_PRESET=nova-lite  # or nova-micro, nova-pro, claude-sonnet, claude-haiku

# Option 2: Specify model ID directly
MODEL_ID=amazon.nova-lite-v1:0
MODEL_TEMPERATURE=0.7
MODEL_MAX_TOKENS=2048
MODEL_TOP_P=0.9

# Usage tracking table
MODEL_USAGE_TABLE=ModelUsage
```

### Presets

Presets provide sensible defaults for each model:

```typescript
{
  'nova-lite': {
    modelId: 'amazon.nova-lite-v1:0',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
  },
  'claude-sonnet': {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
  },
  // ... more presets
}
```

## Usage

### Basic Invocation

```typescript
import { ModelService } from './services/model';

const modelService = new ModelService();

// Simple invocation
const result = await modelService.invokeModel(
  'What is Higurashi about?',
  'You are a helpful assistant analyzing visual novels.'
);

console.log(result.response);
console.log(`Tokens: ${result.inputTokens} in, ${result.outputTokens} out`);
console.log(`Latency: ${result.latencyMs}ms`);
```

### Invocation with Tracking

```typescript
// Invoke and automatically track usage
const response = await modelService.invokeAndTrack(
  'req-123',           // requestId
  'user-456',          // userId
  'Tell me about Rena',
  'You are CICADA.',   // system prompt
  'query'              // agent type
);
```

### Model Switching

```typescript
// Get current config
const config = modelService.getModelConfig();
console.log(`Using: ${config.modelId}`);

// Switch to different model
modelService.setModelConfig({
  modelId: 'amazon.nova-pro-v1:0',
  temperature: 0.5,
});

// Override config for single request
const result = await modelService.invokeModel(
  'Complex query',
  undefined,
  { temperature: 0.9 } // Override just for this request
);
```

## Usage Tracking

The service automatically tracks:
- Request ID and User ID
- Model used
- Input/output token counts
- Latency
- Agent type (orchestrator, query, theory, profile)
- Timestamp

Usage data is stored in DynamoDB for:
- Cost monitoring
- Performance analysis
- Model comparison
- Budget tracking

### Query Usage Data

```typescript
// Usage data is automatically stored in DynamoDB
// Query it for analytics:
const metrics = await dynamodb.query({
  TableName: 'ModelUsage',
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: {
    ':userId': 'user-123',
  },
});

// Calculate costs
const totalInputTokens = metrics.Items.reduce((sum, item) => sum + item.inputTokens, 0);
const totalOutputTokens = metrics.Items.reduce((sum, item) => sum + item.outputTokens, 0);

// Nova Lite pricing: $0.06/1M input, $0.24/1M output
const cost = (totalInputTokens * 0.06 / 1_000_000) + (totalOutputTokens * 0.24 / 1_000_000);
```

## Model Comparison

Use the evaluation framework to compare models:

```typescript
import { EvaluationRunner } from '../evaluation';
import { ModelService } from '../model';

// Test Nova Lite
const novaService = new ModelService();
novaService.setModelConfig({ modelId: 'amazon.nova-lite-v1:0' });

const novaReport = await runner.runEvaluation(
  'amazon.nova-lite-v1:0',
  (query, context) => novaService.invokeAndTrack(
    context.requestId,
    context.userId,
    query
  )
);

// Test Claude Sonnet
const claudeService = new ModelService();
claudeService.setModelConfig({ modelId: 'anthropic.claude-3-sonnet-20240229-v1:0' });

const claudeReport = await runner.runEvaluation(
  'anthropic.claude-3-sonnet-20240229-v1:0',
  (query, context) => claudeService.invokeAndTrack(
    context.requestId,
    context.userId,
    query
  )
);

// Compare results
console.log('Nova Lite:', novaReport.averageScore);
console.log('Claude Sonnet:', claudeReport.averageScore);
```

## Cost Optimization

### Model Selection Guidelines

- **Nova Micro**: Simple queries, character lookups, basic facts
- **Nova Lite**: Most queries, theory analysis, profile updates (default)
- **Nova Pro**: Complex theories, multi-episode analysis
- **Claude Haiku**: Fast responses, simple queries (Maverick alternative)
- **Claude Sonnet**: High-quality responses, complex reasoning (Maverick alternative)

### Best Practices

1. **Start with Nova Lite**: Good balance of cost and quality
2. **Use Nova Micro for simple tasks**: Character lookups, basic facts
3. **Reserve Nova Pro for complex tasks**: Multi-episode theories
4. **Monitor usage**: Check ModelUsage table regularly
5. **Set up alarms**: Alert when daily cost exceeds threshold
6. **Compare models**: Use evaluation framework to find best fit

## Requirements Mapping

- **25.1**: Support selecting between Nova and Maverick models ✓
- **25.2**: Maintain consistent agent behavior across models ✓
- **25.3**: Use selected model for all inference requests ✓
- **25.4**: Track which model generated each response ✓
- **25.5**: Provide configuration options without code changes ✓
