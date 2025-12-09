/**
 * Base Tool Class for AgentCore
 * 
 * Provides a foundation for defining tools that agents can invoke.
 * Tools are functions that agents can call to perform specific actions
 * like searching, updating profiles, etc.
 */

import { z } from 'zod';

/**
 * Tool configuration
 */
export interface ToolConfig<TInput = any, TOutput = any> {
  /**
   * Tool name (must be unique within an agent)
   */
  name: string;

  /**
   * Tool description (helps the agent understand when to use it)
   */
  description: string;

  /**
   * Input schema using Zod for validation
   */
  inputSchema: z.ZodType<TInput>;

  /**
   * Optional output schema for validation
   */
  outputSchema?: z.ZodType<TOutput>;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  /**
   * User ID for data isolation
   */
  userId: string;

  /**
   * Session ID for context
   */
  sessionId: string;

  /**
   * Additional context
   */
  metadata?: Record<string, any>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<TOutput = any> {
  /**
   * Whether the tool execution was successful
   */
  success: boolean;

  /**
   * Tool output data
   */
  data?: TOutput;

  /**
   * Error message if execution failed
   */
  error?: string;

  /**
   * Execution metadata
   */
  metadata?: {
    /**
     * Execution time in milliseconds
     */
    executionTime?: number;

    /**
     * Any warnings or notices
     */
    warnings?: string[];
  };
}

/**
 * Base class for all CICADA tools
 * 
 * Tools are functions that agents can invoke to perform specific actions.
 * Each tool has a name, description, input schema, and execute method.
 */
export abstract class CICADAToolBase<TInput = any, TOutput = any> {
  public readonly name: string;
  public readonly description: string;
  protected readonly inputSchema: z.ZodType<TInput>;
  protected readonly outputSchema?: z.ZodType<TOutput>;

  constructor(config: ToolConfig<TInput, TOutput>) {
    this.name = config.name;
    this.description = config.description;
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
  }

  /**
   * Execute the tool with validated input
   * 
   * This method should be implemented by each specific tool.
   */
  protected abstract executeInternal(
    input: TInput,
    context: ToolExecutionContext
  ): Promise<TOutput>;

  /**
   * Execute the tool with input validation and error handling
   */
  async execute(
    input: unknown,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedInput = this.inputSchema.parse(input);

      // Log tool invocation
      this.logInvocation(context.userId, validatedInput);

      // Execute tool
      const result = await this.executeInternal(validatedInput, context);

      // Validate output if schema provided
      if (this.outputSchema) {
        this.outputSchema.parse(result);
      }

      const executionTime = Date.now() - startTime;

      // Log success
      this.logSuccess(context.userId, executionTime);

      return {
        success: true,
        data: result,
        metadata: {
          executionTime,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log error
      this.logError(context.userId, error as Error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          executionTime,
        },
      };
    }
  }

  /**
   * Log tool invocation
   */
  protected logInvocation(userId: string, input: TInput): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'tool_invocation',
        tool: this.name,
        userId,
        input: this.sanitizeForLogging(input),
      })
    );
  }

  /**
   * Log successful execution
   */
  protected logSuccess(userId: string, executionTime: number): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'tool_success',
        tool: this.name,
        userId,
        executionTime,
      })
    );
  }

  /**
   * Log error
   */
  protected logError(userId: string, error: Error): void {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'tool_error',
        tool: this.name,
        userId,
        error: error.message,
        stack: error.stack,
      })
    );
  }

  /**
   * Sanitize input for logging (remove sensitive data)
   */
  protected sanitizeForLogging(input: TInput): any {
    // Override in subclasses if needed to remove sensitive data
    return input;
  }

  /**
   * Get tool definition for Strands SDK
   */
  getToolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}
