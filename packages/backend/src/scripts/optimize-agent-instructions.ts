/**
 * Agent Instruction Optimization Script
 * 
 * Requirements:
 * - 15.2: Optimize token usage through context management
 * 
 * This script analyzes agent instructions and provides optimization recommendations
 * to reduce token usage while maintaining functionality.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const logger = new Logger('optimize-instructions');

interface InstructionAnalysis {
  agentName: string;
  filePath: string;
  originalLength: number;
  estimatedTokens: number;
  recommendations: string[];
  optimizedInstructions?: string;
  tokenSavings?: number;
}

/**
 * Estimate token count (rough approximation: ~4 characters per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Analyze agent instructions for optimization opportunities
 */
function analyzeInstructions(instructions: string, agentName: string): InstructionAnalysis {
  const recommendations: string[] = [];
  let optimizedInstructions = instructions;

  // Check for redundant whitespace
  const whitespaceCount = (instructions.match(/\s{2,}/g) || []).length;
  if (whitespaceCount > 10) {
    recommendations.push(
      `Remove ${whitespaceCount} instances of redundant whitespace (saves ~${Math.ceil(whitespaceCount / 4)} tokens)`
    );
    optimizedInstructions = optimizedInstructions.replace(/\s{2,}/g, ' ');
  }

  // Check for verbose phrases that can be shortened
  const verbosePhrases = [
    { pattern: /in order to/gi, replacement: 'to', name: '"in order to" → "to"' },
    { pattern: /due to the fact that/gi, replacement: 'because', name: '"due to the fact that" → "because"' },
    { pattern: /at this point in time/gi, replacement: 'now', name: '"at this point in time" → "now"' },
    { pattern: /for the purpose of/gi, replacement: 'to', name: '"for the purpose of" → "to"' },
    { pattern: /in the event that/gi, replacement: 'if', name: '"in the event that" → "if"' },
  ];

  verbosePhrases.forEach(({ pattern, replacement, name }) => {
    const matches = instructions.match(pattern);
    if (matches && matches.length > 0) {
      recommendations.push(`Replace ${matches.length} instances of ${name} (saves ~${matches.length * 2} tokens)`);
      optimizedInstructions = optimizedInstructions.replace(pattern, replacement);
    }
  });

  // Check for repetitive examples
  const exampleCount = (instructions.match(/for example|e\.g\.|such as/gi) || []).length;
  if (exampleCount > 5) {
    recommendations.push(
      `Consider reducing ${exampleCount} examples to 3-4 most important ones (saves ~${(exampleCount - 4) * 20} tokens)`
    );
  }

  // Check for long bullet lists
  const bulletPoints = (instructions.match(/^[\s]*[-*•]\s/gm) || []).length;
  if (bulletPoints > 15) {
    recommendations.push(
      `Consider consolidating ${bulletPoints} bullet points into fewer, more concise points (saves ~${(bulletPoints - 10) * 10} tokens)`
    );
  }

  // Check for repeated instructions
  const lines = instructions.split('\n');
  const uniqueLines = new Set(lines.map(l => l.trim().toLowerCase()));
  const duplicateLines = lines.length - uniqueLines.size;
  if (duplicateLines > 3) {
    recommendations.push(
      `Remove ${duplicateLines} duplicate or near-duplicate lines (saves ~${duplicateLines * 15} tokens)`
    );
  }

  // Check for overly detailed error handling instructions
  if (instructions.toLowerCase().includes('error') && instructions.toLowerCase().includes('exception')) {
    const errorSections = instructions.match(/error|exception|failure|retry/gi) || [];
    if (errorSections.length > 10) {
      recommendations.push(
        `Simplify error handling instructions (currently ${errorSections.length} mentions, saves ~50 tokens)`
      );
    }
  }

  // Check for markdown formatting that could be simplified
  const markdownHeaders = (instructions.match(/^#{1,6}\s/gm) || []).length;
  if (markdownHeaders > 8) {
    recommendations.push(
      `Consider flattening ${markdownHeaders} markdown headers (saves ~${markdownHeaders * 2} tokens)`
    );
  }

  const originalTokens = estimateTokens(instructions);
  const optimizedTokens = estimateTokens(optimizedInstructions);
  const tokenSavings = originalTokens - optimizedTokens;

  return {
    agentName,
    filePath: '',
    originalLength: instructions.length,
    estimatedTokens: originalTokens,
    recommendations,
    optimizedInstructions: tokenSavings > 0 ? optimizedInstructions : undefined,
    tokenSavings: tokenSavings > 0 ? tokenSavings : undefined,
  };
}

/**
 * Analyze all agent instruction files
 */
function analyzeAllAgents(): InstructionAnalysis[] {
  const agentFiles = [
    {
      name: 'Orchestrator',
      path: path.join(__dirname, '../../infrastructure/lib/agent-stack.ts'),
      extractPattern: /getOrchestratorInstructions\(\)[\s\S]*?return `([\s\S]*?)`;/,
    },
    {
      name: 'Query',
      path: path.join(__dirname, '../../infrastructure/lib/agent-stack.ts'),
      extractPattern: /getQueryAgentInstructions\(\)[\s\S]*?return `([\s\S]*?)`;/,
    },
    {
      name: 'Theory',
      path: path.join(__dirname, '../../infrastructure/lib/agent-stack.ts'),
      extractPattern: /getTheoryAgentInstructions\(\)[\s\S]*?return `([\s\S]*?)`;/,
    },
    {
      name: 'Profile',
      path: path.join(__dirname, '../../infrastructure/lib/agent-stack.ts'),
      extractPattern: /getProfileAgentInstructions\(\)[\s\S]*?return `([\s\S]*?)`;/,
    },
  ];

  const analyses: InstructionAnalysis[] = [];

  agentFiles.forEach(({ name, path: filePath, extractPattern }) => {
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`File not found: ${filePath}`);
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const match = content.match(extractPattern);

      if (match && match[1]) {
        const instructions = match[1];
        const analysis = analyzeInstructions(instructions, name);
        analysis.filePath = filePath;
        analyses.push(analysis);
      } else {
        logger.warn(`Could not extract instructions for ${name} agent`);
      }
    } catch (error) {
      logger.error(`Error analyzing ${name} agent`, error);
    }
  });

  return analyses;
}

/**
 * Print optimization report
 */
function printOptimizationReport(analyses: InstructionAnalysis[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('AGENT INSTRUCTION OPTIMIZATION REPORT');
  console.log('='.repeat(80));

  let totalOriginalTokens = 0;
  let totalPotentialSavings = 0;

  analyses.forEach(analysis => {
    console.log(`\n--- ${analysis.agentName.toUpperCase()} AGENT ---`);
    console.log(`File: ${analysis.filePath}`);
    console.log(`Original Length: ${analysis.originalLength} characters`);
    console.log(`Estimated Tokens: ${analysis.estimatedTokens}`);

    totalOriginalTokens += analysis.estimatedTokens;

    if (analysis.recommendations.length > 0) {
      console.log(`\nOptimization Recommendations:`);
      analysis.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });

      if (analysis.tokenSavings) {
        console.log(`\nPotential Token Savings: ${analysis.tokenSavings} tokens (${((analysis.tokenSavings / analysis.estimatedTokens) * 100).toFixed(1)}%)`);
        totalPotentialSavings += analysis.tokenSavings;
      }
    } else {
      console.log(`\n✅ Instructions are already well-optimized`);
    }
  });

  console.log('\n--- SUMMARY ---');
  console.log(`Total Original Tokens: ${totalOriginalTokens}`);
  console.log(`Total Potential Savings: ${totalPotentialSavings} tokens`);
  console.log(`Overall Optimization: ${((totalPotentialSavings / totalOriginalTokens) * 100).toFixed(1)}%`);

  // Cost impact
  const inputCostPerToken = 0.06 / 1_000_000; // Nova Lite input pricing
  const savingsPerQuery = totalPotentialSavings * inputCostPerToken;
  const savingsPer100Queries = savingsPerQuery * 100;

  console.log(`\nCost Impact:`);
  console.log(`  Savings per Query: $${savingsPerQuery.toFixed(6)}`);
  console.log(`  Savings per 100 Queries: $${savingsPer100Queries.toFixed(4)}`);

  console.log('\n' + '='.repeat(80));
}

/**
 * Generate optimization suggestions based on common patterns
 */
function generateOptimizationGuidelines(): void {
  console.log('\n' + '='.repeat(80));
  console.log('GENERAL OPTIMIZATION GUIDELINES');
  console.log('='.repeat(80));

  const guidelines = [
    {
      title: 'Use Concise Language',
      tips: [
        'Replace verbose phrases with shorter alternatives',
        'Remove filler words like "basically", "actually", "essentially"',
        'Use active voice instead of passive voice',
      ],
    },
    {
      title: 'Eliminate Redundancy',
      tips: [
        'Remove duplicate instructions',
        'Consolidate similar bullet points',
        'Reference shared concepts once, not repeatedly',
      ],
    },
    {
      title: 'Optimize Examples',
      tips: [
        'Limit to 2-3 most important examples per concept',
        'Use shorter, more focused examples',
        'Consider removing obvious examples',
      ],
    },
    {
      title: 'Simplify Structure',
      tips: [
        'Flatten nested bullet points where possible',
        'Reduce markdown formatting overhead',
        'Use shorter section headers',
      ],
    },
    {
      title: 'Focus on Essential Information',
      tips: [
        'Remove "nice to have" instructions',
        'Keep only critical error handling guidance',
        'Eliminate explanatory text that doesn\'t change behavior',
      ],
    },
  ];

  guidelines.forEach(({ title, tips }) => {
    console.log(`\n${title}:`);
    tips.forEach(tip => {
      console.log(`  • ${tip}`);
    });
  });

  console.log('\n' + '='.repeat(80));
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  logger.info('Starting agent instruction optimization analysis');

  try {
    // Analyze all agents
    const analyses = analyzeAllAgents();

    if (analyses.length === 0) {
      console.error('No agent instructions found to analyze');
      process.exit(1);
    }

    // Print optimization report
    printOptimizationReport(analyses);

    // Print general guidelines
    generateOptimizationGuidelines();

    logger.info('Optimization analysis completed successfully');
  } catch (error) {
    logger.error('Optimization analysis failed', error);
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

export { main as runOptimizationAnalysis, analyzeInstructions, InstructionAnalysis };
