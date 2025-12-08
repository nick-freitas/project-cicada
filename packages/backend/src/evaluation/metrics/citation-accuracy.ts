/**
 * Citation Accuracy Metric
 * Evaluates whether responses include proper citations with complete metadata
 */

import { EvaluationCase, EvaluationResult } from '../types';

interface Citation {
  episodeId: string;
  chapterId?: string;
  messageId?: string;
  speaker?: string;
}

export function evaluateCitationAccuracy(
  testCase: EvaluationCase,
  response: string
): Partial<EvaluationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Extract citations from response (looking for patterns like [Episode: X, Chapter: Y])
  const citationPattern = /\[Episode:\s*([^,\]]+)(?:,\s*Chapter:\s*([^,\]]+))?(?:,\s*Speaker:\s*([^\]]+))?\]/gi;
  const citations: Citation[] = [];
  let match;
  
  while ((match = citationPattern.exec(response)) !== null) {
    citations.push({
      episodeId: match[1].trim(),
      chapterId: match[2]?.trim(),
      speaker: match[3]?.trim(),
    });
  }
  
  const citationsFound = citations.length;
  const episodesReferenced = [...new Set(citations.map(c => c.episodeId))];
  
  // Check if citations are expected
  if (testCase.expectedBehavior.shouldCite && citationsFound === 0) {
    errors.push('Expected citations but none found');
  }
  
  // Check citation count
  if (testCase.expectedBehavior.citationCount !== undefined) {
    if (citationsFound < testCase.expectedBehavior.citationCount) {
      warnings.push(
        `Expected at least ${testCase.expectedBehavior.citationCount} citations, found ${citationsFound}`
      );
    }
  }
  
  // Check episode references
  if (testCase.expectedBehavior.episodeReferences) {
    const expectedEpisodes = testCase.expectedBehavior.episodeReferences;
    const missingEpisodes = expectedEpisodes.filter(
      ep => !episodesReferenced.includes(ep)
    );
    
    if (missingEpisodes.length > 0) {
      warnings.push(`Missing citations from episodes: ${missingEpisodes.join(', ')}`);
    }
  }
  
  // Calculate score
  let score = 1.0;
  
  if (errors.length > 0) {
    score = 0.0;
  } else {
    // Deduct for warnings
    score -= warnings.length * 0.2;
    score = Math.max(0, score);
  }
  
  return {
    score,
    metrics: {
      citationAccuracy: score,
    },
    details: {
      response,
      citationsFound,
      episodesReferenced,
      errors,
      warnings,
    },
  };
}
