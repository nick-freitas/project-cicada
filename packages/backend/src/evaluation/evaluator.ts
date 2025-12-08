/**
 * Main evaluation orchestrator
 * Runs evaluation cases and aggregates results
 */

import { EvaluationCase, EvaluationResult, EvaluationReport } from './types';
import { evaluateCitationAccuracy } from './metrics/citation-accuracy';
import { evaluateTheoryCoherence } from './metrics/theory-coherence';
import { evaluateStoryCoherence } from './metrics/story-coherence';
import { evaluateOverallCorrectness } from './metrics/overall-correctness';

export class Evaluator {
  constructor(
    private modelId: string,
    private invokeModel: (query: string, context: any) => Promise<string>
  ) {}

  async evaluateCase(testCase: EvaluationCase): Promise<EvaluationResult> {
    // Invoke the model to get a response
    const response = await this.invokeModel(testCase.query, testCase.context);

    // Run all applicable metrics
    const citationResult = evaluateCitationAccuracy(testCase, response);
    const theoryResult = evaluateTheoryCoherence(testCase, response);
    const storyResult = evaluateStoryCoherence(testCase, response);
    const correctnessResult = evaluateOverallCorrectness(testCase, response);

    // Merge results
    const allErrors = [
      ...(citationResult.details?.errors || []),
      ...(theoryResult.details?.errors || []),
      ...(storyResult.details?.errors || []),
      ...(correctnessResult.details?.errors || []),
    ];

    const allWarnings = [
      ...(citationResult.details?.warnings || []),
      ...(theoryResult.details?.warnings || []),
      ...(storyResult.details?.warnings || []),
      ...(correctnessResult.details?.warnings || []),
    ];

    // Calculate overall score based on category
    let overallScore: number;
    switch (testCase.metadata.category) {
      case 'citation':
        overallScore = citationResult.score || 0;
        break;
      case 'theory':
        overallScore = (theoryResult.score || 0) * 0.6 + (citationResult.score || 0) * 0.4;
        break;
      case 'story':
        overallScore = (storyResult.score || 0) * 0.7 + (correctnessResult.score || 0) * 0.3;
        break;
      case 'general':
        overallScore = correctnessResult.score || 0;
        break;
      default:
        overallScore = 0;
    }

    return {
      caseId: testCase.id,
      passed: overallScore >= 0.7,
      score: overallScore,
      metrics: {
        citationAccuracy: citationResult.metrics?.citationAccuracy,
        theoryCoherence: theoryResult.metrics?.theoryCoherence,
        storyCoherence: storyResult.metrics?.storyCoherence,
        overallCorrectness: correctnessResult.metrics?.overallCorrectness,
      },
      details: {
        response,
        citationsFound: citationResult.details?.citationsFound || 0,
        episodesReferenced: citationResult.details?.episodesReferenced || [],
        errors: allErrors,
        warnings: allWarnings,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async evaluateDataset(cases: EvaluationCase[]): Promise<EvaluationReport> {
    const results: EvaluationResult[] = [];

    for (const testCase of cases) {
      try {
        const result = await this.evaluateCase(testCase);
        results.push(result);
      } catch (error) {
        console.error(`Error evaluating case ${testCase.id}:`, error);
        results.push({
          caseId: testCase.id,
          passed: false,
          score: 0,
          metrics: {},
          details: {
            response: '',
            citationsFound: 0,
            episodesReferenced: [],
            errors: [`Evaluation failed: ${error}`],
            warnings: [],
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Calculate aggregates
    const passedCases = results.filter(r => r.passed).length;
    const failedCases = results.length - passedCases;
    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    const citationScores = results
      .map(r => r.metrics.citationAccuracy)
      .filter((s): s is number => s !== undefined);
    const theoryScores = results
      .map(r => r.metrics.theoryCoherence)
      .filter((s): s is number => s !== undefined);
    const storyScores = results
      .map(r => r.metrics.storyCoherence)
      .filter((s): s is number => s !== undefined);
    const correctnessScores = results
      .map(r => r.metrics.overallCorrectness)
      .filter((s): s is number => s !== undefined);

    return {
      runId: `eval-${Date.now()}`,
      timestamp: new Date().toISOString(),
      totalCases: results.length,
      passedCases,
      failedCases,
      averageScore,
      metricAverages: {
        citationAccuracy: citationScores.length > 0
          ? citationScores.reduce((a, b) => a + b, 0) / citationScores.length
          : 0,
        theoryCoherence: theoryScores.length > 0
          ? theoryScores.reduce((a, b) => a + b, 0) / theoryScores.length
          : 0,
        storyCoherence: storyScores.length > 0
          ? storyScores.reduce((a, b) => a + b, 0) / storyScores.length
          : 0,
        overallCorrectness: correctnessScores.length > 0
          ? correctnessScores.reduce((a, b) => a + b, 0) / correctnessScores.length
          : 0,
      },
      results,
      modelInfo: {
        modelId: this.modelId,
      },
    };
  }
}
