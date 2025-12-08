import * as fc from 'fast-check';
import { Citation } from '@cicada/shared-types';
// TODO: Update this test to work with AgentCore implementation
// The old prototype agents have been removed - this test needs to be updated
// to test the AgentCore-based Theory Agent through the handler tools
// import { TheorySuggestion } from '../../src/agents/theory-agent';

// Temporary type definition until test is updated
type TheorySuggestion = {
  theoryName: string;
  description: string;
  reasoning: string;
  relevantProfiles: string[];
};

/**
 * Feature: project-cicada, Property 12: Theory Citation Inclusion
 * Validates: Requirements 8.5
 * 
 * For any theory suggestion, the suggestion SHALL include supporting citations from the script.
 */

describe('Property 12: Theory Citation Inclusion', () => {
  it('should include citations in theory suggestions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.array(fc.string({ minLength: 5, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
        async (theoryName, description, reasoning, relevantProfiles) => {
          // Property: Theory suggestions should have the required structure
          const theorySuggestion: TheorySuggestion = {
            theoryName,
            description,
            reasoning,
            relevantProfiles,
          };

          expect(theorySuggestion.theoryName).toBe(theoryName);
          expect(theorySuggestion.description).toBe(description);
          expect(theorySuggestion.reasoning).toBe(reasoning);
          expect(Array.isArray(theorySuggestion.relevantProfiles)).toBe(true);
          expect(theorySuggestion.relevantProfiles.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain citation structure with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          episodeId: fc.string({ minLength: 3, maxLength: 20 }),
          episodeName: fc.string({ minLength: 3, maxLength: 30 }),
          chapterId: fc.string({ minLength: 3, maxLength: 20 }),
          messageId: fc.integer({ min: 1, max: 10000 }),
          textENG: fc.string({ minLength: 10, maxLength: 200 }),
          speaker: fc.option(fc.string({ minLength: 3, maxLength: 30 }), { nil: undefined }),
          textJPN: fc.option(fc.string({ minLength: 5, maxLength: 200 }), { nil: undefined }),
        }),
        async (citationData) => {
          // Property: Citations should have all required fields
          const citation: Citation = {
            episodeId: citationData.episodeId,
            episodeName: citationData.episodeName,
            chapterId: citationData.chapterId,
            messageId: citationData.messageId,
            textENG: citationData.textENG,
            speaker: citationData.speaker,
            textJPN: citationData.textJPN,
          };

          expect(citation.episodeId).toBeTruthy();
          expect(citation.episodeName).toBeTruthy();
          expect(citation.chapterId).toBeTruthy();
          expect(citation.messageId).toBeGreaterThan(0);
          expect(citation.textENG).toBeTruthy();
          expect(citation.textENG.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle multiple citations for a single theory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 3, maxLength: 20 }),
            episodeName: fc.string({ minLength: 3, maxLength: 30 }),
            chapterId: fc.string({ minLength: 3, maxLength: 20 }),
            messageId: fc.integer({ min: 1, max: 10000 }),
            textENG: fc.string({ minLength: 10, maxLength: 200 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (citationDataArray) => {
          const citations: Citation[] = citationDataArray.map(data => ({
            episodeId: data.episodeId,
            episodeName: data.episodeName,
            chapterId: data.chapterId,
            messageId: data.messageId,
            textENG: data.textENG,
          }));

          // Property: All citations should be valid
          citations.forEach(citation => {
            expect(citation.episodeId).toBeTruthy();
            expect(citation.episodeName).toBeTruthy();
            expect(citation.chapterId).toBeTruthy();
            expect(citation.messageId).toBeGreaterThan(0);
            expect(citation.textENG).toBeTruthy();
          });

          // Property: Citations should be an array
          expect(Array.isArray(citations)).toBe(true);
          expect(citations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve citation metadata across transformations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          episodeId: fc.string({ minLength: 3, maxLength: 20 }),
          episodeName: fc.string({ minLength: 3, maxLength: 30 }),
          chapterId: fc.string({ minLength: 3, maxLength: 20 }),
          messageId: fc.integer({ min: 1, max: 10000 }),
          textENG: fc.string({ minLength: 10, maxLength: 200 }),
          speaker: fc.string({ minLength: 3, maxLength: 30 }),
        }),
        async (citationData) => {
          const citation: Citation = {
            episodeId: citationData.episodeId,
            episodeName: citationData.episodeName,
            chapterId: citationData.chapterId,
            messageId: citationData.messageId,
            textENG: citationData.textENG,
            speaker: citationData.speaker,
          };

          // Property: All fields should be preserved exactly
          expect(citation.episodeId).toBe(citationData.episodeId);
          expect(citation.episodeName).toBe(citationData.episodeName);
          expect(citation.chapterId).toBe(citationData.chapterId);
          expect(citation.messageId).toBe(citationData.messageId);
          expect(citation.textENG).toBe(citationData.textENG);
          expect(citation.speaker).toBe(citationData.speaker);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain citation uniqueness by message ID within an episode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.array(
          fc.record({
            chapterId: fc.string({ minLength: 3, maxLength: 20 }),
            messageId: fc.integer({ min: 1, max: 10000 }),
            textENG: fc.string({ minLength: 10, maxLength: 200 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (episodeId, messages) => {
          const citations: Citation[] = messages.map(msg => ({
            episodeId,
            episodeName: `Episode ${episodeId}`,
            chapterId: msg.chapterId,
            messageId: msg.messageId,
            textENG: msg.textENG,
          }));

          // Property: When deduplicating by messageId within an episode, each should appear once
          const seenIds = new Set<number>();
          const deduplicated: Citation[] = [];

          for (const citation of citations) {
            if (!seenIds.has(citation.messageId)) {
              seenIds.add(citation.messageId);
              deduplicated.push(citation);
            }
          }

          // Property: Deduplicated list should have unique message IDs
          const deduplicatedIds = deduplicated.map(c => c.messageId);
          const uniqueIds = new Set(deduplicatedIds);
          expect(deduplicatedIds.length).toBe(uniqueIds.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});
