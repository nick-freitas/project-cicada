/**
 * Theory Coherence Metric
 * Evaluates whether theory responses are logical, evidence-based, and coherent
 */

import { EvaluationCase, EvaluationResult } from '../types';

export function evaluateTheoryCoherence(
  testCase: EvaluationCase,
  response: string
): Partial<EvaluationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for evidence-based reasoning
  const hasEvidence = /evidence|support|suggest|indicate|show|demonstrate/i.test(response);
  if (!hasEvidence) {
    warnings.push('Theory lacks explicit evidence-based reasoning');
  }
  
  // Check for logical structure
  const hasLogicalStructure = 
    /because|therefore|thus|however|although|while|if.*then/i.test(response);
  if (!hasLogicalStructure) {
    warnings.push('Theory lacks clear logical structure');
  }
  
  // Check for citations (theories should be evidence-based)
  const citationPattern = /\[Episode:/i;
  const hasCitations = citationPattern.test(response);
  
  if (testCase.expectedBehavior.shouldCite && !hasCitations) {
    errors.push('Theory lacks supporting citations');
  }
  
  // Check for hedging language (theories should acknowledge uncertainty)
  const hasHedging = /might|could|possibly|perhaps|may|suggest|appear/i.test(response);
  if (!hasHedging) {
    warnings.push('Theory lacks appropriate hedging language');
  }
  
  // Check for character mentions if expected
  if (testCase.expectedBehavior.shouldMentionCharacters) {
    const mentionedChars = testCase.expectedBehavior.shouldMentionCharacters.filter(
      char => new RegExp(char, 'i').test(response)
    );
    
    if (mentionedChars.length < testCase.expectedBehavior.shouldMentionCharacters.length) {
      const missing = testCase.expectedBehavior.shouldMentionCharacters.filter(
        char => !mentionedChars.includes(char)
      );
      warnings.push(`Theory doesn't mention expected characters: ${missing.join(', ')}`);
    }
  }
  
  // Calculate score
  let score = 1.0;
  
  if (errors.length > 0) {
    score = 0.3; // Partial credit for coherent but uncited theories
  }
  
  score -= warnings.length * 0.15;
  score = Math.max(0, score);
  
  return {
    score,
    metrics: {
      theoryCoherence: score,
    },
    details: {
      response,
      citationsFound: hasCitations ? 1 : 0,
      episodesReferenced: [],
      errors,
      warnings,
    },
  };
}
