import { CICADAError, ValidationError, NotFoundError, ServiceError } from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('CICADAError', () => {
    test('creates error with all properties', () => {
      const error = new CICADAError('Internal message', 'TEST_CODE', true, 'User message');

      expect(error.message).toBe('Internal message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.retryable).toBe(true);
      expect(error.userMessage).toBe('User message');
      expect(error.name).toBe('CICADAError');
    });
  });

  describe('ValidationError', () => {
    test('creates validation error with default user message', () => {
      const error = new ValidationError('Field is required');

      expect(error.message).toBe('Field is required');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.userMessage).toBe('Invalid input provided');
      expect(error.name).toBe('ValidationError');
    });

    test('creates validation error with custom user message', () => {
      const error = new ValidationError('Field is required', 'Custom message');

      expect(error.userMessage).toBe('Custom message');
    });
  });

  describe('NotFoundError', () => {
    test('creates not found error with default user message', () => {
      const error = new NotFoundError('Profile not found');

      expect(error.message).toBe('Profile not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.retryable).toBe(false);
      expect(error.userMessage).toBe('Resource not found');
      expect(error.name).toBe('NotFoundError');
    });

    test('creates not found error with custom user message', () => {
      const error = new NotFoundError('Profile not found', 'Profile does not exist');

      expect(error.userMessage).toBe('Profile does not exist');
    });
  });

  describe('ServiceError', () => {
    test('creates service error with default user message', () => {
      const error = new ServiceError('DynamoDB timeout');

      expect(error.message).toBe('DynamoDB timeout');
      expect(error.code).toBe('SERVICE_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.userMessage).toBe('Service temporarily unavailable');
      expect(error.name).toBe('ServiceError');
    });

    test('creates service error with custom user message', () => {
      const error = new ServiceError('DynamoDB timeout', 'Please try again later');

      expect(error.userMessage).toBe('Please try again later');
    });
  });
});
