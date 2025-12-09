/**
 * Example Tool Implementation
 * 
 * This is a simple example showing how to create a tool
 * that agents can invoke.
 */

import { CICADAToolBase, ToolExecutionContext } from '../base';
import { z } from 'zod';

/**
 * Input schema for the calculator tool
 */
const calculatorInputSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
  a: z.number(),
  b: z.number(),
});

type CalculatorInput = z.infer<typeof calculatorInputSchema>;

/**
 * Output type for the calculator tool
 */
interface CalculatorOutput {
  result: number;
  operation: string;
}

/**
 * Example calculator tool
 */
export class CalculatorTool extends CICADAToolBase<CalculatorInput, CalculatorOutput> {
  constructor() {
    super({
      name: 'calculator',
      description: 'Perform basic arithmetic operations (add, subtract, multiply, divide)',
      inputSchema: calculatorInputSchema,
    });
  }

  /**
   * Execute the calculator operation
   */
  protected async executeInternal(
    input: CalculatorInput,
    context: ToolExecutionContext
  ): Promise<CalculatorOutput> {
    let result: number;

    switch (input.operation) {
      case 'add':
        result = input.a + input.b;
        break;
      case 'subtract':
        result = input.a - input.b;
        break;
      case 'multiply':
        result = input.a * input.b;
        break;
      case 'divide':
        if (input.b === 0) {
          throw new Error('Division by zero is not allowed');
        }
        result = input.a / input.b;
        break;
    }

    return {
      result,
      operation: `${input.a} ${input.operation} ${input.b} = ${result}`,
    };
  }
}

/**
 * Example usage:
 * 
 * ```typescript
 * const calculator = new CalculatorTool();
 * 
 * const result = await calculator.execute(
 *   {
 *     operation: 'add',
 *     a: 5,
 *     b: 3,
 *   },
 *   {
 *     userId: 'user-123',
 *     sessionId: 'session-456',
 *   }
 * );
 * 
 * if (result.success) {
 *   console.log(result.data?.operation); // "5 add 3 = 8"
 *   console.log(result.data?.result);    // 8
 * }
 * ```
 * 
 * To use with a Strands Agent:
 * 
 * ```typescript
 * import { Agent, tool } from '@strands-agents/sdk';
 * 
 * const calculator = new CalculatorTool();
 * 
 * const agent = new Agent({
 *   systemPrompt: 'You are a helpful math assistant.',
 *   tools: [
 *     tool({
 *       name: calculator.name,
 *       description: calculator.description,
 *       inputSchema: calculator.getToolDefinition().inputSchema,
 *       fn: async (input) => {
 *         const result = await calculator.execute(input, {
 *           userId: 'user-123',
 *           sessionId: 'session-456',
 *         });
 *         return result.data;
 *       },
 *     }),
 *   ],
 * });
 * 
 * const response = await agent.invoke('What is 5 + 3?');
 * console.log(response);
 * ```
 */
