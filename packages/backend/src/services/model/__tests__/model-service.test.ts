/**
 * Unit tests for ModelService
 */

import { ModelService } from '../model-service';
import { DEFAULT_MODEL_CONFIGS } from '../types';

describe('ModelService', () => {
  let modelService: ModelService;

  beforeEach(() => {
    // Set environment variables for testing
    process.env.AWS_REGION = 'us-east-1';
    process.env.MODEL_USAGE_TABLE = 'test-model-usage';
    process.env.MODEL_PRESET = 'nova-lite';
    
    modelService = new ModelService();
  });

  afterEach(() => {
    delete process.env.MODEL_PRESET;
    delete process.env.MODEL_ID;
  });

  describe('Model Configuration', () => {
    it('should load default Nova Lite config from preset', () => {
      const config = modelService.getModelConfig();
      
      expect(config.modelId).toBe('amazon.nova-lite-v1:0');
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(2048);
    });

    it('should support updating model config', () => {
      modelService.setModelConfig({
        temperature: 0.5,
        maxTokens: 1024,
      });

      const config = modelService.getModelConfig();
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(1024);
      expect(config.modelId).toBe('amazon.nova-lite-v1:0'); // Unchanged
    });

    it('should support switching to different model', () => {
      modelService.setModelConfig({
        modelId: 'amazon.nova-pro-v1:0',
      });

      const config = modelService.getModelConfig();
      expect(config.modelId).toBe('amazon.nova-pro-v1:0');
    });
  });

  describe('Model Presets', () => {
    it('should have Nova Lite preset', () => {
      expect(DEFAULT_MODEL_CONFIGS['nova-lite']).toBeDefined();
      expect(DEFAULT_MODEL_CONFIGS['nova-lite'].modelId).toBe('amazon.nova-lite-v1:0');
    });

    it('should have Nova Micro preset', () => {
      expect(DEFAULT_MODEL_CONFIGS['nova-micro']).toBeDefined();
      expect(DEFAULT_MODEL_CONFIGS['nova-micro'].modelId).toBe('amazon.nova-micro-v1:0');
    });

    it('should have Nova Pro preset', () => {
      expect(DEFAULT_MODEL_CONFIGS['nova-pro']).toBeDefined();
      expect(DEFAULT_MODEL_CONFIGS['nova-pro'].modelId).toBe('amazon.nova-pro-v1:0');
    });

    it('should have Claude Sonnet preset (Maverick)', () => {
      expect(DEFAULT_MODEL_CONFIGS['claude-sonnet']).toBeDefined();
      expect(DEFAULT_MODEL_CONFIGS['claude-sonnet'].modelId).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
    });

    it('should have Claude Haiku preset (Maverick)', () => {
      expect(DEFAULT_MODEL_CONFIGS['claude-haiku']).toBeDefined();
      expect(DEFAULT_MODEL_CONFIGS['claude-haiku'].modelId).toBe('anthropic.claude-3-haiku-20240307-v1:0');
    });
  });

  describe('Environment Variable Loading', () => {
    it('should load from MODEL_PRESET when set', () => {
      process.env.MODEL_PRESET = 'nova-pro';
      const service = new ModelService();
      
      const config = service.getModelConfig();
      expect(config.modelId).toBe('amazon.nova-pro-v1:0');
    });

    it('should load from MODEL_ID when set', () => {
      delete process.env.MODEL_PRESET;
      process.env.MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';
      
      const service = new ModelService();
      const config = service.getModelConfig();
      
      expect(config.modelId).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
    });

    it('should default to Nova Lite when no env vars set', () => {
      delete process.env.MODEL_PRESET;
      delete process.env.MODEL_ID;
      
      const service = new ModelService();
      const config = service.getModelConfig();
      
      expect(config.modelId).toBe('amazon.nova-lite-v1:0');
    });
  });
});
