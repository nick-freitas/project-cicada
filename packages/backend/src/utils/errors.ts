export class CICADAError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean,
    public userMessage: string
  ) {
    super(message);
    this.name = 'CICADAError';
  }
}

export class ValidationError extends CICADAError {
  constructor(message: string, userMessage: string = 'Invalid input provided') {
    super(message, 'VALIDATION_ERROR', false, userMessage);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends CICADAError {
  constructor(message: string, userMessage: string = 'Resource not found') {
    super(message, 'NOT_FOUND', false, userMessage);
    this.name = 'NotFoundError';
  }
}

export class ServiceError extends CICADAError {
  constructor(message: string, userMessage: string = 'Service temporarily unavailable') {
    super(message, 'SERVICE_ERROR', true, userMessage);
    this.name = 'ServiceError';
  }
}
