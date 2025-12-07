import * as fc from 'fast-check';
import { FragmentGroupService } from '../../src/services/fragment-group-service';
import { ProfileService } from '../../src/services/profile-service';
import { Citation } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 16: Cross-Episode Attribution
 * Validates: Requirements 9.5, 10.5, 11.4
 * 
 * For any information from a fragment group, the source episode SHALL be clearly
 * attributed and SHALL NOT be conflated with information from other episodes.
 */

// Mock DynamoDB
let mockProfiles: Map<string, any>;
let mockSend: jest.Mock;

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const mockSendFn = jest.fn();
  return {
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockSendFn })),
    },
    PutCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'PutCommand' }, input })),
    GetCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'GetCommand' }, input })),
    QueryCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'QueryCommand' }, input })),
    UpdateCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'UpdateCommand' }, input })),
    DeleteCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'DeleteCommand' }, input })),
  };
});

describe('Property 16: Cross-Episode Attribution', () => {
  let fragmentGroupService: FragmentGroupService;
  let profileService: ProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = new Map();

    profileService = new ProfileService();
    fragmentGroupService = new FragmentGroupService();

    // Get the mock send function
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockClient = DynamoDBDocumentClient.from();
    mockSend = mockClient.send;

    // Mock DynamoDB operations
    mockSend.mockImplementation((command: any) => {
      const commandName = command.constructor.name;

      if (commandName === 'PutCommand') {
        const key = `${command.input.Item.userId}#${command.input.Item.profileKey}`;
        if (mockProfiles.has(key) && command.input.ConditionExpression?.includes('attribute_not_exists')) {
          return Promise.reject({ name: 'ConditionalCheckFailedException' });
        }
        mockProfiles.set(key, command.input.Item);
        return Promise.resolve({});
      }

      if (commandName === 'GetCommand') {
        const key = `${command.input.Key.userId}#${command.input.Key.profileKey}`;
        const item = mockProfiles.get(key);
        return Promise.resolve({ Item: item });
      }

      if (commandName === 'QueryCommand') {
        const userId = command.input.ExpressionAttributeValues[':userId'];
        const items = Array.from(mockProfiles.values()).filter((item) => item.userId === userId);

        if (command.input.KeyConditionExpression?.includes('begins_with')) {
          const prefix = command.input.ExpressionAttributeValues[':profileType'];
          return Promise.resolve({
            Items: items.filter((item) => item.profileKey.startsWith(prefix)),
          });
        }

        return Promise.resolve({ Items: items });
      }

      if (commandName === 'UpdateCommand') {
        const key = `${command.input.Key.userId}#${command.input.Key.profileKey}`;
        const item = mockProfiles.get(key);
        if (!item && command.input.ConditionExpression?.includes('attribute_exists')) {
          return Promise.reject({ name: 'ConditionalCheckFailedException' });
        }
        if (item) {
          const updates = command.input.ExpressionAttributeValues;
          mockProfiles.set(key, {
            ...item,
            profileData: updates[':profileData'],
            updatedAt: updates[':updatedAt'],
          });
        }
        return Promise.resolve({});
      }

      if (commandName === 'DeleteCommand') {
        const key = `${command.input.Key.userId}#${command.input.Key.profileKey}`;
        mockProfiles.delete(key);
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });
  });

  it('should maintain episode attribution in connections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 4 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 3, maxLength: 20 }),
            episodeName: fc.string({ minLength: 3, maxLength: 30 }),
            textENG: fc.string({ minLength: 10, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, connectionDesc, citationData, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 2);

          // Create citations with episode attribution
          const citations: Citation[] = citationData.map((data, idx) => ({
            episodeId: uniqueEpisodeIds[idx % uniqueEpisodeIds.length],
            episodeName: data.episodeName,
            chapterId: `chapter-${idx}`,
            messageId: idx,
            textENG: data.textENG,
          }));

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Add connection with citations
          await fragmentGroupService.addConnection(userId, groupName, connectionDesc, citations);

          // Property: Retrieved connection should maintain episode attribution
          const group = await fragmentGroupService.getFragmentGroup(userId, groupName);
          
          expect(group).not.toBeNull();
          expect(group?.connections.length).toBe(1);
          expect(group?.connections[0].evidence.length).toBe(citations.length);

          // Each citation should have its episode ID preserved
          for (let i = 0; i < citations.length; i++) {
            expect(group?.connections[0].evidence[i].episodeId).toBe(citations[i].episodeId);
            expect(group?.connections[0].evidence[i].episodeName).toBe(citations[i].episodeName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain episode attribution in divergences', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 4 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.array(
          fc.record({
            episodeId: fc.string({ minLength: 3, maxLength: 20 }),
            episodeName: fc.string({ minLength: 3, maxLength: 30 }),
            textENG: fc.string({ minLength: 10, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, divergenceDesc, citationData, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 2);

          // Create citations with episode attribution
          const citations: Citation[] = citationData.map((data, idx) => ({
            episodeId: uniqueEpisodeIds[idx % uniqueEpisodeIds.length],
            episodeName: data.episodeName,
            chapterId: `chapter-${idx}`,
            messageId: idx,
            textENG: data.textENG,
          }));

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Add divergence with citations
          await fragmentGroupService.addDivergence(userId, groupName, divergenceDesc, citations);

          // Property: Retrieved divergence should maintain episode attribution
          const group = await fragmentGroupService.getFragmentGroup(userId, groupName);
          
          expect(group).not.toBeNull();
          expect(group?.divergences.length).toBe(1);
          expect(group?.divergences[0].evidence.length).toBe(citations.length);

          // Each citation should have its episode ID preserved
          for (let i = 0; i < citations.length; i++) {
            expect(group?.divergences[0].evidence[i].episodeId).toBe(citations[i].episodeId);
            expect(group?.divergences[0].evidence[i].episodeName).toBe(citations[i].episodeName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should distinguish citations from different episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.tuple(
          fc.string({ minLength: 3, maxLength: 20 }),
          fc.string({ minLength: 3, maxLength: 20 })
        ).filter(([e1, e2]) => e1 !== e2),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, [episode1, episode2], connectionDesc, sharedTimeline) => {
          // Create citations from two different episodes
          const citation1: Citation = {
            episodeId: episode1,
            episodeName: `Episode ${episode1}`,
            chapterId: 'chapter-1',
            messageId: 1,
            textENG: 'Text from episode 1',
          };

          const citation2: Citation = {
            episodeId: episode2,
            episodeName: `Episode ${episode2}`,
            chapterId: 'chapter-2',
            messageId: 2,
            textENG: 'Text from episode 2',
          };

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            [episode1, episode2],
            sharedTimeline
          );

          // Add connection with citations from both episodes
          await fragmentGroupService.addConnection(
            userId,
            groupName,
            connectionDesc,
            [citation1, citation2]
          );

          // Property: Citations should be distinguishable by episode
          const group = await fragmentGroupService.getFragmentGroup(userId, groupName);
          
          expect(group).not.toBeNull();
          const evidence = group?.connections[0].evidence || [];
          
          // Should have citations from both episodes
          const episodesInEvidence = new Set(evidence.map(c => c.episodeId));
          expect(episodesInEvidence.has(episode1)).toBe(true);
          expect(episodesInEvidence.has(episode2)).toBe(true);

          // Each citation should maintain its original episode
          const citation1Retrieved = evidence.find(c => c.episodeId === episode1);
          const citation2Retrieved = evidence.find(c => c.episodeId === episode2);
          
          expect(citation1Retrieved).toBeDefined();
          expect(citation2Retrieved).toBeDefined();
          expect(citation1Retrieved?.textENG).toBe('Text from episode 1');
          expect(citation2Retrieved?.textENG).toBe('Text from episode 2');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve episode attribution across multiple connections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 3 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 4 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, connectionDescs, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          const uniqueDescs = Array.from(new Set(connectionDescs));
          fc.pre(uniqueEpisodeIds.length >= 2 && uniqueDescs.length >= 2);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Add multiple connections, each with citations from different episodes
          for (let i = 0; i < uniqueDescs.length; i++) {
            const episodeId = uniqueEpisodeIds[i % uniqueEpisodeIds.length];
            const citation: Citation = {
              episodeId,
              episodeName: `Episode ${episodeId}`,
              chapterId: `chapter-${i}`,
              messageId: i,
              textENG: `Text from ${episodeId} for connection ${i}`,
            };

            await fragmentGroupService.addConnection(userId, groupName, uniqueDescs[i], [citation]);
          }

          // Property: Each connection should maintain its episode attribution
          const group = await fragmentGroupService.getFragmentGroup(userId, groupName);
          
          expect(group).not.toBeNull();
          expect(group?.connections.length).toBe(uniqueDescs.length);

          for (let i = 0; i < uniqueDescs.length; i++) {
            const connection = group?.connections[i];
            const expectedEpisodeId = uniqueEpisodeIds[i % uniqueEpisodeIds.length];
            
            expect(connection?.evidence.length).toBeGreaterThan(0);
            expect(connection?.evidence[0].episodeId).toBe(expectedEpisodeId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not conflate citations from different episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 3, maxLength: 5 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, connectionDesc, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 3);

          // Create citations, each from a different episode
          const citations: Citation[] = uniqueEpisodeIds.map((episodeId, idx) => ({
            episodeId,
            episodeName: `Episode ${episodeId}`,
            chapterId: `chapter-${idx}`,
            messageId: idx,
            textENG: `Unique text from ${episodeId}`,
          }));

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Add connection with citations from all episodes
          await fragmentGroupService.addConnection(userId, groupName, connectionDesc, citations);

          // Property: Each citation should maintain its unique episode ID
          const group = await fragmentGroupService.getFragmentGroup(userId, groupName);
          
          expect(group).not.toBeNull();
          const evidence = group?.connections[0].evidence || [];
          
          // All episode IDs should be present and distinct
          const episodeIdsInEvidence = evidence.map(c => c.episodeId);
          expect(new Set(episodeIdsInEvidence).size).toBe(uniqueEpisodeIds.length);

          // Each citation should have its original episode ID
          for (const citation of citations) {
            const retrieved = evidence.find(
              c => c.episodeId === citation.episodeId && c.messageId === citation.messageId
            );
            expect(retrieved).toBeDefined();
            expect(retrieved?.textENG).toBe(citation.textENG);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain attribution when citations have same content but different episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.tuple(
          fc.string({ minLength: 3, maxLength: 20 }),
          fc.string({ minLength: 3, maxLength: 20 })
        ).filter(([e1, e2]) => e1 !== e2),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, [episode1, episode2], sameText, connectionDesc, sharedTimeline) => {
          // Create two citations with same text but different episodes
          const citation1: Citation = {
            episodeId: episode1,
            episodeName: `Episode ${episode1}`,
            chapterId: 'chapter-1',
            messageId: 1,
            textENG: sameText,
          };

          const citation2: Citation = {
            episodeId: episode2,
            episodeName: `Episode ${episode2}`,
            chapterId: 'chapter-2',
            messageId: 2,
            textENG: sameText,
          };

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            [episode1, episode2],
            sharedTimeline
          );

          // Add connection with both citations
          await fragmentGroupService.addConnection(
            userId,
            groupName,
            connectionDesc,
            [citation1, citation2]
          );

          // Property: Despite same text, episodes should remain distinct
          const group = await fragmentGroupService.getFragmentGroup(userId, groupName);
          
          expect(group).not.toBeNull();
          const evidence = group?.connections[0].evidence || [];
          
          expect(evidence.length).toBe(2);
          
          // Both episodes should be represented
          const episodeIds = evidence.map(c => c.episodeId);
          expect(episodeIds).toContain(episode1);
          expect(episodeIds).toContain(episode2);
          
          // Citations should be distinguishable by episode even with same text
          const fromEpisode1 = evidence.filter(c => c.episodeId === episode1);
          const fromEpisode2 = evidence.filter(c => c.episodeId === episode2);
          
          expect(fromEpisode1.length).toBe(1);
          expect(fromEpisode2.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
