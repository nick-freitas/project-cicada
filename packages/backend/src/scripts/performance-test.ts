/**
 * Performance Testing Script for AgentCore Implementation
 * 
 * Requirements:
 * - 15.1: Use cost-effective foundation models (Nova Lite/Micro)
 * - 15.2: Optimize token usage through context management
 * - 15.3: Configure appropriate resource limits
 * - 15.5: Total Monthly Cost SHALL remain below $100
 * 
 * This script measures:
 * - Agent invocation latency
 * - Token usage per query
 * - Concurrent request handling
 * - Cost estimation
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { Logger } from '../utils/logger';

const logger = new Logger('performance-test');

interface PerformanceTestConfig {
  orchestratorAgentId: string;
  orchestratorAgentAliasId: string;
  region: string;
  testQueries: string[];
  concurrentRequests?: number;
  iterations?: number;
}

interface PerformanceMetrics {
  queryIndex: number;
  query: string;
  latency: number; // milliseconds
  timeToFirstChunk: number; // milliseconds
  totalChunks: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  success: boolean;
  error?: string;
}

interface PerformanceSummary {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageLatency: number;
  medianLatency: number;
  p95Latency: number;
  p99Latency: number;
  averageTimeToFirstChunk: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  averageTokensPerQuery: number;
  estimatedCostPer100Queries: number;
  estimatedMonthlyCost: number; // Based on 100 queries/month
}

/**
 * Test queries covering different agent coordination patterns
 */
const DEFAULT_TEST_QUERIES = [
  // Query Agent only
  'What does Rena say about the dam project?',
  'Tell me about the Watanagashi Festival.',
  'What happens in chapter 3 of Onikakushi?',
  
  // Theory Agent (invokes Query Agent)
  'Analyze the theory that Mion and Shion are the same person.',
  'What evidence supports the time loop theory?',
  
  // Profile Agent
  'What do we know about Rika Furude?',
  'Tell me about the Sonozaki family.',
  
  // Complex multi-agent coordination
  'Compare what Rena says about Oyashiro-sama in different episodes.',
  'How does the dam project relate to the curse?',
  
  // Edge cases
  'What is the significance of the number 34?',
  'Explain the relationship between Satoko and Satoshi.',
];

/**
 * Invoke agent and measure performance
 */
async function measureAgentInvocation(
  client: BedrockAgentRuntimeClient,
  config: PerformanceTestConfig,
  query: string,
  queryIndex: number
): Promise<PerformanceMetrics> {
  const startTime = Date.now();
  let timeToFirstChunk = 0;
  let firstChunkReceived = false;
  let totalChunks = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const command = new InvokeAgentCommand({
      agentId: config.orchestratorAgentId,
      agentAliasId: config.orchestratorAgentAliasId,
      sessionId: `perf-test-${Date.now()}-${queryIndex}`,
      inputText: query,
      enableTrace: true,
    });

    const response = await client.send(command);

    // Process streaming response
    if (response.completion) {
      for await (const event of response.completion) {
        if (!firstChunkReceived) {
          timeToFirstChunk = Date.now() - startTime;
          firstChunkReceived = true;
        }

        if (event.chunk?.bytes) {
          totalChunks++;
        }

        // Extract token usage from trace events
        if (event.trace?.trace?.orchestrationTrace?.modelInvocationInput) {
          const input = event.trace.trace.orchestrationTrace.modelInvocationInput;
          if (input.text) {
            // Rough estimation: ~4 characters per token
            inputTokens += Math.ceil(input.text.length / 4);
          }
        }

        if (event.trace?.trace?.orchestrationTrace?.modelInvocationOutput) {
          const output = event.trace.trace.orchestrationTrace.modelInvocationOutput;
          if (output.rawResponse?.content) {
            const content = JSON.stringify(output.rawResponse.content);
            outputTokens += Math.ceil(content.length / 4);
          }
        }
      }
    }

    const latency = Date.now() - startTime;

    return {
      queryIndex,
      query,
      latency,
      timeToFirstChunk,
      totalChunks,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      totalTokens: inputTokens + outputTokens || undefined,
      success: true,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      queryIndex,
      query,
      latency,
      timeToFirstChunk,
      totalChunks,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run sequential performance tests
 */
async function runSequentialTests(
  client: BedrockAgentRuntimeClient,
  config: PerformanceTestConfig
): Promise<PerformanceMetrics[]> {
  const results: PerformanceMetrics[] = [];
  const queries = config.testQueries;

  logger.info('Starting sequential performance tests', {
    totalQueries: queries.length,
  });

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    logger.info(`Testing query ${i + 1}/${queries.length}`, { query });

    const metrics = await measureAgentInvocation(client, config, query, i);
    results.push(metrics);

    logger.info(`Query ${i + 1} completed`, {
      latency: metrics.latency,
      timeToFirstChunk: metrics.timeToFirstChunk,
      success: metrics.success,
    });

    // Small delay between requests to avoid throttling
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Run concurrent performance tests
 */
async function runConcurrentTests(
  client: BedrockAgentRuntimeClient,
  config: PerformanceTestConfig
): Promise<PerformanceMetrics[]> {
  const concurrency = config.concurrentRequests || 3;
  const queries = config.testQueries;

  logger.info('Starting concurrent performance tests', {
    totalQueries: queries.length,
    concurrency,
  });

  const results: PerformanceMetrics[] = [];

  // Process queries in batches
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    logger.info(`Processing batch ${Math.floor(i / concurrency) + 1}`, {
      batchSize: batch.length,
    });

    const batchPromises = batch.map((query, batchIndex) =>
      measureAgentInvocation(client, config, query, i + batchIndex)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    logger.info(`Batch ${Math.floor(i / concurrency) + 1} completed`, {
      successCount: batchResults.filter(r => r.success).length,
      failureCount: batchResults.filter(r => !r.success).length,
    });

    // Delay between batches
    if (i + concurrency < queries.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}

/**
 * Calculate performance summary statistics
 */
function calculateSummary(metrics: PerformanceMetrics[]): PerformanceSummary {
  const successful = metrics.filter(m => m.success);
  const failed = metrics.filter(m => !m.success);

  // Latency statistics
  const latencies = successful.map(m => m.latency).sort((a, b) => a - b);
  const averageLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length || 0;
  const medianLatency = latencies[Math.floor(latencies.length / 2)] || 0;
  const p95Index = Math.floor(latencies.length * 0.95);
  const p99Index = Math.floor(latencies.length * 0.99);
  const p95Latency = latencies[p95Index] || latencies[latencies.length - 1] || 0;
  const p99Latency = latencies[p99Index] || latencies[latencies.length - 1] || 0;

  // Time to first chunk
  const timeToFirstChunks = successful.map(m => m.timeToFirstChunk).filter(t => t > 0);
  const averageTimeToFirstChunk =
    timeToFirstChunks.reduce((sum, t) => sum + t, 0) / timeToFirstChunks.length || 0;

  // Token usage
  const totalInputTokens = successful.reduce((sum, m) => sum + (m.inputTokens || 0), 0);
  const totalOutputTokens = successful.reduce((sum, m) => sum + (m.outputTokens || 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  const averageTokensPerQuery = totalTokens / successful.length || 0;

  // Cost estimation (Nova Lite pricing: $0.06/1M input, $0.24/1M output)
  const inputCost = (totalInputTokens / 1_000_000) * 0.06;
  const outputCost = (totalOutputTokens / 1_000_000) * 0.24;
  const totalCost = inputCost + outputCost;
  const costPer100Queries = (totalCost / successful.length) * 100;
  
  // Estimate monthly cost (100 queries/month as per requirements)
  const estimatedMonthlyCost = costPer100Queries;

  return {
    totalQueries: metrics.length,
    successfulQueries: successful.length,
    failedQueries: failed.length,
    averageLatency,
    medianLatency,
    p95Latency,
    p99Latency,
    averageTimeToFirstChunk,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    averageTokensPerQuery,
    estimatedCostPer100Queries: costPer100Queries,
    estimatedMonthlyCost,
  };
}

/**
 * Print performance report
 */
function printReport(
  sequentialMetrics: PerformanceMetrics[],
  concurrentMetrics: PerformanceMetrics[]
): void {
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE TEST REPORT');
  console.log('='.repeat(80));

  // Sequential tests
  console.log('\n--- SEQUENTIAL TESTS ---');
  const seqSummary = calculateSummary(sequentialMetrics);
  console.log(`Total Queries: ${seqSummary.totalQueries}`);
  console.log(`Successful: ${seqSummary.successfulQueries}`);
  console.log(`Failed: ${seqSummary.failedQueries}`);
  console.log(`\nLatency Metrics:`);
  console.log(`  Average: ${seqSummary.averageLatency.toFixed(2)} ms`);
  console.log(`  Median: ${seqSummary.medianLatency.toFixed(2)} ms`);
  console.log(`  P95: ${seqSummary.p95Latency.toFixed(2)} ms`);
  console.log(`  P99: ${seqSummary.p99Latency.toFixed(2)} ms`);
  console.log(`  Avg Time to First Chunk: ${seqSummary.averageTimeToFirstChunk.toFixed(2)} ms`);
  console.log(`\nToken Usage:`);
  console.log(`  Total Input Tokens: ${seqSummary.totalInputTokens}`);
  console.log(`  Total Output Tokens: ${seqSummary.totalOutputTokens}`);
  console.log(`  Total Tokens: ${seqSummary.totalTokens}`);
  console.log(`  Average Tokens per Query: ${seqSummary.averageTokensPerQuery.toFixed(2)}`);
  console.log(`\nCost Estimation:`);
  console.log(`  Cost per 100 Queries: $${seqSummary.estimatedCostPer100Queries.toFixed(4)}`);
  console.log(`  Estimated Monthly Cost (100 queries): $${seqSummary.estimatedMonthlyCost.toFixed(4)}`);

  // Concurrent tests
  console.log('\n--- CONCURRENT TESTS ---');
  const concSummary = calculateSummary(concurrentMetrics);
  console.log(`Total Queries: ${concSummary.totalQueries}`);
  console.log(`Successful: ${concSummary.successfulQueries}`);
  console.log(`Failed: ${concSummary.failedQueries}`);
  console.log(`\nLatency Metrics:`);
  console.log(`  Average: ${concSummary.averageLatency.toFixed(2)} ms`);
  console.log(`  Median: ${concSummary.medianLatency.toFixed(2)} ms`);
  console.log(`  P95: ${concSummary.p95Latency.toFixed(2)} ms`);
  console.log(`  P99: ${concSummary.p99Latency.toFixed(2)} ms`);
  console.log(`  Avg Time to First Chunk: ${concSummary.averageTimeToFirstChunk.toFixed(2)} ms`);

  // Budget validation
  console.log('\n--- BUDGET VALIDATION ---');
  const monthlyBudget = 100; // $100/month requirement
  const infrastructureCost = 20; // Estimated infrastructure cost
  const totalEstimatedCost = seqSummary.estimatedMonthlyCost + infrastructureCost;
  const budgetUtilization = (totalEstimatedCost / monthlyBudget) * 100;

  console.log(`Monthly Budget: $${monthlyBudget.toFixed(2)}`);
  console.log(`Estimated Agent Cost: $${seqSummary.estimatedMonthlyCost.toFixed(4)}`);
  console.log(`Estimated Infrastructure Cost: $${infrastructureCost.toFixed(2)}`);
  console.log(`Total Estimated Cost: $${totalEstimatedCost.toFixed(2)}`);
  console.log(`Budget Utilization: ${budgetUtilization.toFixed(2)}%`);

  if (totalEstimatedCost <= monthlyBudget) {
    console.log(`✅ WITHIN BUDGET (${(monthlyBudget - totalEstimatedCost).toFixed(2)} remaining)`);
  } else {
    console.log(`❌ OVER BUDGET by $${(totalEstimatedCost - monthlyBudget).toFixed(2)}`);
  }

  // Detailed results
  console.log('\n--- DETAILED RESULTS ---');
  console.log('\nSequential Test Results:');
  sequentialMetrics.forEach(m => {
    const status = m.success ? '✅' : '❌';
    console.log(
      `${status} Query ${m.queryIndex + 1}: ${m.latency}ms (TTFC: ${m.timeToFirstChunk}ms, Tokens: ${m.totalTokens || 'N/A'})`
    );
    if (!m.success) {
      console.log(`   Error: ${m.error}`);
    }
  });

  console.log('\n' + '='.repeat(80));
}

/**
 * Main performance test execution
 */
async function main(): Promise<void> {
  // Load configuration from environment
  const config: PerformanceTestConfig = {
    orchestratorAgentId: process.env.ORCHESTRATOR_AGENT_ID || '',
    orchestratorAgentAliasId: process.env.ORCHESTRATOR_AGENT_ALIAS_ID || '',
    region: process.env.AWS_REGION || 'us-east-1',
    testQueries: DEFAULT_TEST_QUERIES,
    concurrentRequests: 3,
  };

  if (!config.orchestratorAgentId || !config.orchestratorAgentAliasId) {
    console.error('Error: ORCHESTRATOR_AGENT_ID and ORCHESTRATOR_AGENT_ALIAS_ID must be set');
    process.exit(1);
  }

  logger.info('Starting performance tests', {
    agentId: config.orchestratorAgentId,
    region: config.region,
    totalQueries: config.testQueries.length,
  });

  const client = new BedrockAgentRuntimeClient({ region: config.region });

  try {
    // Run sequential tests
    const sequentialMetrics = await runSequentialTests(client, config);

    // Run concurrent tests
    const concurrentMetrics = await runConcurrentTests(client, config);

    // Print report
    printReport(sequentialMetrics, concurrentMetrics);

    logger.info('Performance tests completed successfully');
  } catch (error) {
    logger.error('Performance tests failed', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as runPerformanceTests, PerformanceMetrics, PerformanceSummary };
