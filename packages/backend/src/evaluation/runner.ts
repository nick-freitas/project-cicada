/**
 * Evaluation runner
 * Loads datasets and executes evaluations
 */

import * as fs from 'fs';
import * as path from 'path';
import { EvaluationCase, EvaluationReport } from './types';
import { Evaluator } from './evaluator';

export class EvaluationRunner {
  private datasetsPath: string;

  constructor(datasetsPath?: string) {
    this.datasetsPath = datasetsPath || path.join(__dirname, 'datasets');
  }

  loadDataset(filename: string): EvaluationCase[] {
    const filePath = path.join(this.datasetsPath, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as EvaluationCase[];
  }

  loadAllDatasets(): EvaluationCase[] {
    const files = fs.readdirSync(this.datasetsPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const allCases: EvaluationCase[] = [];
    for (const file of jsonFiles) {
      const cases = this.loadDataset(file);
      allCases.push(...cases);
    }

    return allCases;
  }

  async runEvaluation(
    modelId: string,
    invokeModel: (query: string, context: any) => Promise<string>,
    datasetName?: string
  ): Promise<EvaluationReport> {
    const evaluator = new Evaluator(modelId, invokeModel);

    const cases = datasetName
      ? this.loadDataset(datasetName)
      : this.loadAllDatasets();

    console.log(`Running evaluation with ${cases.length} test cases...`);
    const report = await evaluator.evaluateDataset(cases);

    console.log(`\nEvaluation Complete:`);
    console.log(`  Total Cases: ${report.totalCases}`);
    console.log(`  Passed: ${report.passedCases}`);
    console.log(`  Failed: ${report.failedCases}`);
    console.log(`  Average Score: ${(report.averageScore * 100).toFixed(1)}%`);
    console.log(`\nMetric Averages:`);
    console.log(`  Citation Accuracy: ${(report.metricAverages.citationAccuracy * 100).toFixed(1)}%`);
    console.log(`  Theory Coherence: ${(report.metricAverages.theoryCoherence * 100).toFixed(1)}%`);
    console.log(`  Story Coherence: ${(report.metricAverages.storyCoherence * 100).toFixed(1)}%`);
    console.log(`  Overall Correctness: ${(report.metricAverages.overallCorrectness * 100).toFixed(1)}%`);

    return report;
  }

  saveReport(report: EvaluationReport, outputPath: string): void {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${outputPath}`);
  }
}
