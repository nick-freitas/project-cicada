/**
 * Overall Correctness Metric
 * Evaluates general accuracy and appropriateness of responses
 */

import { EvaluationCase, EvaluationResult } from '../types';

export function evaluateOverallCorrectness(
  testCase: EvaluationCase,
  response: string
): Partial<EvaluationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check response length (should be substantive)
  if (response.length < 50) {
    errors.push('Response is too short to be useful');
  }
  
  // Check for hallucination indicators
  const hallucinations = [
    /I don't have information/i,
    /I cannot find/i,
    /no data available/i,
    /I'm not sure/i,
  ];
  
  const hasHallucination = hallucinations.some(pattern => pattern.test(response));
  if (hasHallucination && testCase.metadata.difficulty === 'easy') {
    warnings.push('Response indicates lack of information for easy query');
  }
  
  // Check for appropriate tone
  const inappropriateTone = [
    /obviously/i,
    /clearly you/i,
    /everyone knows/i,
  ];
  
  const hasBadTone = inappropriateTone.some(pattern => pattern.test(response));
  if (hasBadTone) {
    warnings.push('Response has inappropriate tone');
  }
  
  // Check for character mentions if expected
  if (testCase.expectedBehavior.shouldMentionCharacters) {
    const mentionedChars = testCase.expectedBehavior.shouldMentionCharacters.filter(
      char => new RegExp(char, 'i').test(response)
    );
    
    const coverage = mentionedChars.length / testCase.expectedBehavior.shouldMentionCharacters.length;
    if (coverage < 0.5) {
      warnings.push('Response mentions fewer than half of expected characters');
    }
  }
  
  // Check for relevance to query
  const queryWords = testCase.query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const responseWords = response.toLowerCase().split(/\s+/);
  const matchedWords = queryWords.filter(w => responseWords.includes(w));
  const relevance = matchedWords.length / queryWords.length;
  
  if (relevance < 0.3) {
    warnings.push('Response may not be relevant to query');
  }
  
  // Calculate score
  let score = 1.0;
  
  if (errors.length > 0) {
    score = 0.0;
  }
  
  score -= warnings.length * 0.15;
  score = Math.max(0, score);
  
  return {
    score,
    metrics: {
      overallCorrectness: score,
    },
    details: {
      response,
      citationsFound: 0,
      episodesReferenced: [],
      errors,
      warnings,
    },
  };
}
