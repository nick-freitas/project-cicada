/**
 * Story Coherence Metric
 * Evaluates whether responses maintain story consistency and avoid contradictions
 */

import { EvaluationCase, EvaluationResult } from '../types';

export function evaluateStoryCoherence(
  testCase: EvaluationCase,
  response: string
): Partial<EvaluationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for spoiler awareness
  if (testCase.expectedBehavior.shouldAvoidSpoilers) {
    const spoilerIndicators = [
      /reveal/i,
      /actually/i,
      /truth is/i,
      /in reality/i,
      /turns out/i,
    ];
    
    const hasSpoilerLanguage = spoilerIndicators.some(pattern => pattern.test(response));
    if (hasSpoilerLanguage) {
      warnings.push('Response may contain spoiler language');
    }
  }
  
  // Check episode scope adherence
  if (testCase.context.episodeScope && testCase.context.episodeScope.length > 0) {
    const citationPattern = /\[Episode:\s*([^,\]]+)/gi;
    let match;
    const citedEpisodes: string[] = [];
    
    while ((match = citationPattern.exec(response)) !== null) {
      citedEpisodes.push(match[1].trim());
    }
    
    const outOfScopeEpisodes = citedEpisodes.filter(
      ep => !testCase.context.episodeScope!.includes(ep)
    );
    
    if (outOfScopeEpisodes.length > 0) {
      errors.push(
        `Response cites episodes outside scope: ${outOfScopeEpisodes.join(', ')}`
      );
    }
  }
  
  // Check for character mentions if expected
  if (testCase.expectedBehavior.shouldMentionCharacters) {
    const mentionedChars = testCase.expectedBehavior.shouldMentionCharacters.filter(
      char => new RegExp(char, 'i').test(response)
    );
    
    if (mentionedChars.length === 0) {
      errors.push('Response doesn\'t mention expected characters');
    }
  }
  
  // Check for contradictory statements
  const contradictionPatterns = [
    /but (earlier|previously|before).*said/i,
    /contradicts/i,
    /inconsistent/i,
  ];
  
  const hasContradictions = contradictionPatterns.some(pattern => pattern.test(response));
  if (hasContradictions) {
    warnings.push('Response may contain contradictory statements');
  }
  
  // Calculate score
  let score = 1.0;
  
  if (errors.length > 0) {
    score = 0.0;
  }
  
  score -= warnings.length * 0.2;
  score = Math.max(0, score);
  
  return {
    score,
    metrics: {
      storyCoherence: score,
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
