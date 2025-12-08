/**
 * Structured logging utility for CICADA
 * 
 * Requirements:
 * - 13.1: Log invocation details to CloudWatch
 * - 13.2: Emit metrics for latency and token usage
 * - 13.3: Log detailed error information
 * - 13.4: Trace the flow of requests across agents
 */

/**
 * Agent invocation log metadata
 */
export interface AgentInvocationLogMetadata {
  agentName: string;
  agentId?: string;
  agentAliasId?: string;
  sessionId?: string;
  userId?: string;
  requestId?: string;
  attempt?: number;
  maxRetries?: number;
  duration?: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  coordinationType?: string; // e.g., "Orchestrator-Query"
  traceId?: string;
  parentSpanId?: string;
  spanId?: string;
}

/**
 * Agent coordination log metadata
 */
export interface AgentCoordinationLogMetadata {
  sourceAgent: string;
  targetAgent: string;
  coordinationType: string;
  duration?: number;
  requestId?: string;
  traceId?: string;
}

/**
 * Error log metadata
 */
export interface ErrorLogMetadata {
  errorName?: string;
  errorCode?: string;
  retryable?: boolean;
  agentName?: string;
  requestId?: string;
  traceId?: string;
}

export class Logger {
  constructor(private context: string) {}

  /**
   * Log general information
   */
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        level: 'info',
        context: this.context,
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log error information
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    console.error(
      JSON.stringify({
        level: 'error',
        context: this.context,
        message,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log warning information
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(
      JSON.stringify({
        level: 'warn',
        context: this.context,
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log debug information
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(
      JSON.stringify({
        level: 'debug',
        context: this.context,
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log agent invocation start
   * Requirement 13.1: Log invocation details to CloudWatch
   */
  logAgentInvocationStart(meta: AgentInvocationLogMetadata): void {
    this.info('Agent invocation started', {
      ...meta,
      eventType: 'agent_invocation_start',
    });
  }

  /**
   * Log agent invocation success
   * Requirement 13.1, 13.2: Log invocation details and emit metrics
   */
  logAgentInvocationSuccess(meta: AgentInvocationLogMetadata): void {
    this.info('Agent invocation completed successfully', {
      ...meta,
      eventType: 'agent_invocation_success',
    });

    // Emit CloudWatch metric for successful invocation
    this.emitMetric('AgentInvocationCount', 1, 'Count', {
      AgentName: meta.agentName,
    });

    // Emit duration metric if available
    if (meta.duration !== undefined) {
      this.emitMetric('AgentInvocationDuration', meta.duration, 'Milliseconds', {
        AgentName: meta.agentName,
      });
    }

    // Emit token usage metrics if available
    if (meta.tokenUsage) {
      if (meta.tokenUsage.total !== undefined) {
        this.emitMetric('AgentTokenUsage', meta.tokenUsage.total, 'Count', {
          AgentName: meta.agentName,
        });
      }
      if (meta.tokenUsage.input !== undefined) {
        this.emitMetric('AgentInputTokens', meta.tokenUsage.input, 'Count', {
          AgentName: meta.agentName,
        });
      }
      if (meta.tokenUsage.output !== undefined) {
        this.emitMetric('AgentOutputTokens', meta.tokenUsage.output, 'Count', {
          AgentName: meta.agentName,
        });
      }
    }
  }

  /**
   * Log agent invocation failure
   * Requirement 13.3: Log detailed error information
   */
  logAgentInvocationFailure(meta: AgentInvocationLogMetadata & ErrorLogMetadata, error?: Error): void {
    this.error('Agent invocation failed', error, {
      ...meta,
      eventType: 'agent_invocation_failure',
    });

    // Emit CloudWatch metric for failed invocation
    this.emitMetric('AgentInvocationErrors', 1, 'Count', {
      AgentName: meta.agentName,
      ErrorType: meta.errorName || 'Unknown',
    });
  }

  /**
   * Log agent coordination
   * Requirement 13.4: Trace the flow of requests across agents
   */
  logAgentCoordination(meta: AgentCoordinationLogMetadata): void {
    this.info('Agent coordination', {
      ...meta,
      eventType: 'agent_coordination',
    });

    // Emit coordination latency metric if available
    if (meta.duration !== undefined) {
      this.emitMetric('AgentCoordinationLatency', meta.duration, 'Milliseconds', {
        CoordinationType: meta.coordinationType,
      });
    }
  }

  /**
   * Log streaming event
   */
  logStreamingEvent(
    eventType: 'stream_start' | 'stream_chunk' | 'stream_complete' | 'stream_error',
    meta: Record<string, unknown>
  ): void {
    this.info(`Streaming: ${eventType}`, {
      ...meta,
      eventType,
    });
  }

  /**
   * Emit CloudWatch custom metric
   * Requirement 13.2: Emit metrics for latency and token usage
   * 
   * Note: This uses CloudWatch Embedded Metric Format (EMF)
   * which allows metrics to be extracted from logs automatically
   */
  private emitMetric(
    metricName: string,
    value: number,
    unit: string,
    dimensions: Record<string, string>
  ): void {
    // CloudWatch Embedded Metric Format
    const emfLog = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'CICADA/Agents',
            Dimensions: [Object.keys(dimensions)],
            Metrics: [
              {
                Name: metricName,
                Unit: unit,
              },
            ],
          },
        ],
      },
      ...dimensions,
      [metricName]: value,
    };

    console.log(JSON.stringify(emfLog));
  }
}

// Default logger instance
export const logger = new Logger('cicada');
