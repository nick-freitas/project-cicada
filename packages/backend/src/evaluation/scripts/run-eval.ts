#!/usr/bin/env node
/**
 * CLI script to run evaluations
 */

import { EvaluationRunner } from '../runner';
import * as path from 'path';

// Mock model invocation for testing
// In production, this would call the actual Orchestrator agent
async function mockInvokeModel(query: string, context: any): Promise<string> {
  // This is a placeholder - replace with actual agent invocation
  console.log(`Invoking model for query: ${query}`);
  
  // Simulate a response with citations
  return `This is a mock response to: ${query}. [Episode: onikakushi, Chapter: 1, Speaker: Rena]`;
}

async function main() {
  const args = process.argv.slice(2);
  const datasetName = args[0]; // Optional: specific dataset file
  const modelId = args[1] || 'anthropic.claude-3-sonnet';
  const outputPath = args[2] || path.join(process.cwd(), 'eval-report.json');

  console.log('='.repeat(60));
  console.log('CICADA Model Evaluation');
  console.log('='.repeat(60));
  console.log(`Model: ${modelId}`);
  console.log(`Dataset: ${datasetName || 'all'}`);
  console.log(`Output: ${outputPath}`);
  console.log('='.repeat(60));
  console.log();

  const runner = new EvaluationRunner();

  try {
    const report = await runner.runEvaluation(
      modelId,
      mockInvokeModel,
      datasetName
    );

    runner.saveReport(report, outputPath);

    // Exit with error code if evaluation failed
    if (report.failedCases > 0) {
      console.log('\n⚠️  Some test cases failed');
      process.exit(1);
    } else {
      console.log('\n✅ All test cases passed');
      process.exit(0);
    }
  } catch (error) {
    console.error('Evaluation failed:', error);
    process.exit(1);
  }
}

main();
