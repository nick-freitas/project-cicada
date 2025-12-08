/**
 * Unit tests for evaluation metrics
 */

import { EvaluationCase } from '../types';
import { evaluateCitationAccuracy } from '../metrics/citation-accuracy';
import { evaluateTheoryCoherence } from '../metrics/theory-coherence';
import { evaluateStoryCoherence } from '../metrics/story-coherence';
import { evaluateOverallCorrectness } from '../metrics/overall-correctness';

describe('Citation Accuracy Metric', () => {
  const testCase: EvaluationCase = {
    id: 'test-1',
    query: 'What does Rena say?',
    context: { userId: 'test' },
    expectedBehavior: {
      shouldCite: true,
      citationCount: 1,
      episodeReferences: ['onikakushi'],
    },
    metadata: {
      category: 'citation',
      difficulty: 'easy',
      description: 'Test',
    },
  };

  it('should pass with proper citations', () => {
    const response = 'Rena says "Kana kana" [Episode: onikakushi, Chapter: 1, Speaker: Rena]';
    const result = evaluateCitationAccuracy(testCase, response);

    expect(result.score).toBe(1.0);
    expect(result.details?.errors).toHaveLength(0);
    expect(result.details?.citationsFound).toBe(1);
  });

  it('should fail when citations are missing', () => {
    const response = 'Rena says "Kana kana"';
    const result = evaluateCitationAccuracy(testCase, response);

    expect(result.score).toBe(0.0);
    expect(result.details?.errors).toContain('Expected citations but none found');
  });

  it('should warn when citation count is low', () => {
    const testCaseMultiple = { ...testCase, expectedBehavior: { ...testCase.expectedBehavior, citationCount: 2 } };
    const response = 'Rena says "Kana kana" [Episode: onikakushi]';
    const result = evaluateCitationAccuracy(testCaseMultiple, response);

    expect(result.details?.warnings.length).toBeGreaterThan(0);
  });
});

describe('Theory Coherence Metric', () => {
  const testCase: EvaluationCase = {
    id: 'test-2',
    query: 'Theory about Mion',
    context: { userId: 'test' },
    expectedBehavior: {
      shouldCite: true,
      shouldMentionCharacters: ['Mion'],
    },
    metadata: {
      category: 'theory',
      difficulty: 'medium',
      description: 'Test',
    },
  };

  it('should pass with evidence-based theory', () => {
    const response = 'The evidence suggests that Mion might be hiding something [Episode: watanagashi]. This could indicate a deeper mystery.';
    const result = evaluateTheoryCoherence(testCase, response);

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.details?.errors).toHaveLength(0);
  });

  it('should fail without citations', () => {
    const response = 'Mion is definitely hiding something.';
    const result = evaluateTheoryCoherence(testCase, response);

    expect(result.score).toBeLessThan(0.5);
    expect(result.details?.errors).toContain('Theory lacks supporting citations');
  });

  it('should warn without hedging language', () => {
    const response = 'Mion is hiding something [Episode: watanagashi]. The evidence shows this.';
    const result = evaluateTheoryCoherence(testCase, response);

    expect(result.details?.warnings.some(w => w.includes('hedging'))).toBe(true);
  });
});

describe('Story Coherence Metric', () => {
  const testCase: EvaluationCase = {
    id: 'test-3',
    query: 'Tell me about Rena',
    context: { userId: 'test', episodeScope: ['onikakushi'] },
    expectedBehavior: {
      shouldCite: true,
      shouldAvoidSpoilers: true,
      shouldMentionCharacters: ['Rena'],
    },
    metadata: {
      category: 'story',
      difficulty: 'easy',
      description: 'Test',
    },
  };

  it('should pass with coherent story response', () => {
    const response = 'Rena is a kind girl who loves cute things [Episode: onikakushi].';
    const result = evaluateStoryCoherence(testCase, response);

    expect(result.score).toBe(1.0);
    expect(result.details?.errors).toHaveLength(0);
  });

  it('should error on out-of-scope episodes', () => {
    const response = 'Rena appears in [Episode: watanagashi] and [Episode: onikakushi].';
    const result = evaluateStoryCoherence(testCase, response);

    expect(result.score).toBe(0.0);
    expect(result.details?.errors.some(e => e.includes('outside scope'))).toBe(true);
  });

  it('should warn about spoiler language', () => {
    const response = 'Rena actually reveals the truth later [Episode: onikakushi].';
    const result = evaluateStoryCoherence(testCase, response);

    expect(result.details?.warnings.some(w => w.includes('spoiler'))).toBe(true);
  });
});

describe('Overall Correctness Metric', () => {
  const testCase: EvaluationCase = {
    id: 'test-4',
    query: 'Who are the main characters?',
    context: { userId: 'test' },
    expectedBehavior: {
      shouldCite: false,
      shouldMentionCharacters: ['Keiichi', 'Rena', 'Mion'],
    },
    metadata: {
      category: 'general',
      difficulty: 'easy',
      description: 'Test',
    },
  };

  it('should pass with correct response', () => {
    const response = 'The main characters include Keiichi, Rena, Mion, Satoko, and Rika. They are students in Hinamizawa.';
    const result = evaluateOverallCorrectness(testCase, response);

    expect(result.score).toBeGreaterThan(0.7);
    expect(result.details?.errors).toHaveLength(0);
  });

  it('should fail with too short response', () => {
    const response = 'Keiichi and friends.';
    const result = evaluateOverallCorrectness(testCase, response);

    expect(result.score).toBe(0.0);
    expect(result.details?.errors).toContain('Response is too short to be useful');
  });

  it('should warn about low character coverage', () => {
    const response = 'The main character is Keiichi. He moves to a rural village and makes new friends there.';
    const result = evaluateOverallCorrectness(testCase, response);

    expect(result.details?.warnings.some(w => w.includes('fewer than half'))).toBe(true);
  });
});
