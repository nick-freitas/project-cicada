/**
 * Types for model evaluation using AWS Evals
 */

export interface EvaluationCase {
  id: string;
  query: string;
  context: {
    userId: string;
    sessionId?: string;
    episodeScope?: string[];
  };
  expectedBehavior: {
    shouldCite: boolean;
    citationCount?: number;
    episodeReferences?: string[];
    shouldMentionCharacters?: string[];
    shouldAvoidSpoilers?: boolean;
  };
  metadata: {
    category: 'citation' | 'theory' | 'story' | 'general';
    difficulty: 'easy' | 'medium' | 'hard';
    description: string;
  };
}

export interface EvaluationResult {
  caseId: string;
  passed: boolean;
  score: number; // 0-1
  metrics: {
    citationAccuracy?: number;
    theoryCoherence?: number;
    storyCoherence?: number;
    overallCorrectness?: number;
  };
  details: {
    response: string;
    citationsFound: number;
    episodesReferenced: string[];
    errors: string[];
    warnings: string[];
  };
  timestamp: string;
}

export interface EvaluationReport {
  runId: string;
  timestamp: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  metricAverages: {
    citationAccuracy: number;
    theoryCoherence: number;
    storyCoherence: number;
    overallCorrectness: number;
  };
  results: EvaluationResult[];
  modelInfo: {
    modelId: string;
    temperature?: number;
    maxTokens?: number;
  };
}
