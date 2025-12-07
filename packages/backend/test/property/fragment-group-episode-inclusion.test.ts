import * as fc from 'fast-check';
import { FragmentGroupService } from '../../src/services/fragment-group-service';
import { ProfileService } from '../../src/services/profile-service';

/**
 * Feature: project-cicada, Property 14: Fragment Group Episode Inclusion
 * Validates: Requirements 9.2, 9.3, 10.3
 * 
 * For any fragment group, all episodes in the group SHALL be retrievable and
 * SHALL be considered contextually relevant when analyzing any episode in the group.
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

describe('Property 14: Fragment Group Episode Inclusion', () => {
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

  it('should include all episodes added to a fragment group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 2);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Property: All episodes should be retrievable
          const episodes = await fragmentGroupService.getEpisodesInGroup(userId, groupName);
          
          expect(episodes.length).toBe(uniqueEpisodeIds.length);
          for (const episodeId of uniqueEpisodeIds) {
            expect(episodes).toContain(episodeId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should identify all groups containing a specific episode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.array(fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)), { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupNames, targetEpisode, sharedTimeline) => {
          const uniqueGroupNames = Array.from(new Set(groupNames));
          fc.pre(uniqueGroupNames.length >= 2);

          // Create multiple groups, all containing the target episode
          for (const groupName of uniqueGroupNames) {
            await fragmentGroupService.createFragmentGroup(
              userId,
              groupName,
              [targetEpisode, `other-${groupName}`],
              sharedTimeline
            );
          }

          // Property: All groups should be found when searching for the episode
          const groups = await fragmentGroupService.findGroupsContainingEpisode(userId, targetEpisode);
          
          expect(groups.length).toBe(uniqueGroupNames.length);
          for (const groupName of uniqueGroupNames) {
            expect(groups.some(g => g.groupName === groupName)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly identify episode membership in groups', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, includedEpisodes, excludedEpisode, sharedTimeline) => {
          const uniqueIncluded = Array.from(new Set(includedEpisodes));
          fc.pre(uniqueIncluded.length >= 2);
          fc.pre(!uniqueIncluded.includes(excludedEpisode));

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueIncluded,
            sharedTimeline
          );

          // Property: Included episodes should be in the group
          for (const episodeId of uniqueIncluded) {
            const isInGroup = await fragmentGroupService.isEpisodeInGroup(userId, groupName, episodeId);
            expect(isInGroup).toBe(true);
          }

          // Property: Excluded episode should not be in the group
          const isExcludedInGroup = await fragmentGroupService.isEpisodeInGroup(userId, groupName, excludedEpisode);
          expect(isExcludedInGroup).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain episode inclusion after adding episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, initialEpisodes, additionalEpisodes, sharedTimeline) => {
          const uniqueInitial = Array.from(new Set(initialEpisodes));
          const uniqueAdditional = Array.from(new Set(additionalEpisodes)).filter(
            e => !uniqueInitial.includes(e)
          );
          fc.pre(uniqueInitial.length > 0 && uniqueAdditional.length > 0);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueInitial,
            sharedTimeline
          );

          // Add more episodes
          await fragmentGroupService.addEpisodesToGroup(userId, groupName, uniqueAdditional);

          // Property: All episodes (initial + additional) should be in the group
          const allEpisodes = [...uniqueInitial, ...uniqueAdditional];
          const retrievedEpisodes = await fragmentGroupService.getEpisodesInGroup(userId, groupName);

          expect(retrievedEpisodes.length).toBe(allEpisodes.length);
          for (const episodeId of allEpisodes) {
            expect(retrievedEpisodes).toContain(episodeId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain episode inclusion after removing episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 3, maxLength: 6 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 3);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Remove one episode
          const toRemove = [uniqueEpisodeIds[0]];
          const remaining = uniqueEpisodeIds.slice(1);

          await fragmentGroupService.removeEpisodesFromGroup(userId, groupName, toRemove);

          // Property: Remaining episodes should still be in the group
          const retrievedEpisodes = await fragmentGroupService.getEpisodesInGroup(userId, groupName);

          expect(retrievedEpisodes.length).toBe(remaining.length);
          for (const episodeId of remaining) {
            expect(retrievedEpisodes).toContain(episodeId);
          }

          // Property: Removed episode should not be in the group
          expect(retrievedEpisodes).not.toContain(toRemove[0]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not include duplicate episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 2);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Try to add the same episodes again
          await fragmentGroupService.addEpisodesToGroup(userId, groupName, uniqueEpisodeIds);

          // Property: Episodes should not be duplicated
          const retrievedEpisodes = await fragmentGroupService.getEpisodesInGroup(userId, groupName);
          
          expect(retrievedEpisodes.length).toBe(uniqueEpisodeIds.length);
          
          // Check for duplicates
          const episodeSet = new Set(retrievedEpisodes);
          expect(episodeSet.size).toBe(retrievedEpisodes.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
