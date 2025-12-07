export class Logger {
  constructor(private context: string) {}

  info(message: string, meta?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', context: this.context, message, ...meta }));
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    console.error(
      JSON.stringify({
        level: 'error',
        context: this.context,
        message,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...meta,
      })
    );
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ level: 'warn', context: this.context, message, ...meta }));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(JSON.stringify({ level: 'debug', context: this.context, message, ...meta }));
  }
}
