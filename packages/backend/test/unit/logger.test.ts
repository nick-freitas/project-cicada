import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('TestContext');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('logs info messages with context', () => {
    logger.info('Test message', { key: 'value' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"info"')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('"context":"TestContext"')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Test message"')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"key":"value"'));
  });

  test('logs error messages with error details', () => {
    const error = new Error('Test error');
    logger.error('Error occurred', error, { key: 'value' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"error"')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"context":"TestContext"')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Error occurred"')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"error":"Test error"')
    );
  });

  test('logs warn messages', () => {
    logger.warn('Warning message', { key: 'value' });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"warn"')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"context":"TestContext"')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Warning message"')
    );
  });

  test('logs debug messages', () => {
    logger.debug('Debug message', { key: 'value' });

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"debug"')
    );
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('"context":"TestContext"')
    );
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Debug message"')
    );
  });
});
