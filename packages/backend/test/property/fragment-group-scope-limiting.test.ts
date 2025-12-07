import * as fc from 'fast-check';
import { FragmentGroupService } from '../../src/services/fragment-group-service';
import { ProfileService } from '../../src/services/profile-service';

/**
 * Feature: project-cicada, Property 15: Fragment Group Scope Limiting
 * Validates: Requirements 9.4
 * 
 * For any query scoped to a fragment group, results SHALL only include episodes
 * within that group and SHALL NOT include episodes from outside the group.
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

describe('Property 15: Fragment Group Scope Limiting', () => {
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

  it('should only return episodes within the specified group', async () => {
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

          // Property: Retrieved episodes should exactly match the group's episodes
          const retrievedEpisodes = await fragmentGroupService.getEpisodesInGroup(userId, groupName);
          
          expect(retrievedEpisodes.length).toBe(uniqueEpisodeIds.length);
          expect(new Set(retrievedEpisodes)).toEqual(new Set(uniqueEpisodeIds));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not include episodes from other groups', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.tuple(
          fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
          fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s))
        ).filter(([g1, g2]) => g1 !== g2),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 4 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 4 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, [group1Name, group2Name], episodes1, episodes2, sharedTimeline) => {
          const unique1 = Array.from(new Set(episodes1));
          const unique2 = Array.from(new Set(episodes2)).filter(e => !unique1.includes(e));
          fc.pre(unique1.length >= 2 && unique2.length >= 2);

          // Create two separate fragment groups
          await fragmentGroupService.createFragmentGroup(userId, group1Name, unique1, sharedTimeline);
          await fragmentGroupService.createFragmentGroup(userId, group2Name, unique2, sharedTimeline);

          // Property: Group 1 should only contain its episodes
          const group1Episodes = await fragmentGroupService.getEpisodesInGroup(userId, group1Name);
          expect(new Set(group1Episodes)).toEqual(new Set(unique1));
          for (const episode of unique2) {
            expect(group1Episodes).not.toContain(episode);
          }

          // Property: Group 2 should only contain its episodes
          const group2Episodes = await fragmentGroupService.getEpisodesInGroup(userId, group2Name);
          expect(new Set(group2Episodes)).toEqual(new Set(unique2));
          for (const episode of unique1) {
            expect(group2Episodes).not.toContain(episode);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly scope episode searches to specific groups', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.array(fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)), { minLength: 2, maxLength: 4 }),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupNames, sharedEpisode, sharedTimeline) => {
          const uniqueGroupNames = Array.from(new Set(groupNames));
          fc.pre(uniqueGroupNames.length >= 2);

          // Create multiple groups, some containing the shared episode, some not
          const groupsWithEpisode = uniqueGroupNames.slice(0, Math.ceil(uniqueGroupNames.length / 2));
          const groupsWithoutEpisode = uniqueGroupNames.slice(Math.ceil(uniqueGroupNames.length / 2));

          for (const groupName of groupsWithEpisode) {
            await fragmentGroupService.createFragmentGroup(
              userId,
              groupName,
              [sharedEpisode, `unique-${groupName}`],
              sharedTimeline
            );
          }

          for (const groupName of groupsWithoutEpisode) {
            await fragmentGroupService.createFragmentGroup(
              userId,
              groupName,
              [`other-${groupName}`],
              sharedTimeline
            );
          }

          // Property: Only groups with the episode should be found
          const foundGroups = await fragmentGroupService.findGroupsContainingEpisode(userId, sharedEpisode);
          
          expect(foundGroups.length).toBe(groupsWithEpisode.length);
          for (const groupName of groupsWithEpisode) {
            expect(foundGroups.some(g => g.groupName === groupName)).toBe(true);
          }
          for (const groupName of groupsWithoutEpisode) {
            expect(foundGroups.some(g => g.groupName === groupName)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain scope boundaries after modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.tuple(
          fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
          fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s))
        ).filter(([g1, g2]) => g1 !== g2),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 3, maxLength: 5 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, [group1Name, group2Name], episodeIds, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length >= 3);

          const group1Episodes = uniqueEpisodeIds.slice(0, 2);
          const group2Episodes = uniqueEpisodeIds.slice(2);
          const episodeToMove = group1Episodes[0];

          // Create two groups
          await fragmentGroupService.createFragmentGroup(userId, group1Name, group1Episodes, sharedTimeline);
          await fragmentGroupService.createFragmentGroup(userId, group2Name, group2Episodes, sharedTimeline);

          // Remove episode from group1
          await fragmentGroupService.removeEpisodesFromGroup(userId, group1Name, [episodeToMove]);

          // Add episode to group2
          await fragmentGroupService.addEpisodesToGroup(userId, group2Name, [episodeToMove]);

          // Property: Episode should now only be in group2
          const group1Result = await fragmentGroupService.isEpisodeInGroup(userId, group1Name, episodeToMove);
          const group2Result = await fragmentGroupService.isEpisodeInGroup(userId, group2Name, episodeToMove);

          expect(group1Result).toBe(false);
          expect(group2Result).toBe(true);

          // Property: Episode should only be found in group2
          const foundGroups = await fragmentGroupService.findGroupsContainingEpisode(userId, episodeToMove);
          expect(foundGroups.length).toBe(1);
          expect(foundGroups[0].groupName).toBe(group2Name);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should enforce user-specific scope boundaries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5)
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 4 }),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async ([user1, user2], groupName, user1Episodes, sharedEpisode, sharedTimeline) => {
          const uniqueUser1Episodes = Array.from(new Set(user1Episodes));
          fc.pre(uniqueUser1Episodes.length >= 2);

          // User1 creates a group with specific episodes
          await fragmentGroupService.createFragmentGroup(
            user1,
            groupName,
            uniqueUser1Episodes,
            sharedTimeline
          );

          // User2 creates a group with the same name but different episodes
          await fragmentGroupService.createFragmentGroup(
            user2,
            groupName,
            [sharedEpisode],
            sharedTimeline
          );

          // Property: User1's group should only contain user1's episodes
          const user1GroupEpisodes = await fragmentGroupService.getEpisodesInGroup(user1, groupName);
          expect(new Set(user1GroupEpisodes)).toEqual(new Set(uniqueUser1Episodes));
          expect(user1GroupEpisodes).not.toContain(sharedEpisode);

          // Property: User2's group should only contain user2's episodes
          const user2GroupEpisodes = await fragmentGroupService.getEpisodesInGroup(user2, groupName);
          expect(user2GroupEpisodes).toEqual([sharedEpisode]);
          for (const episode of uniqueUser1Episodes) {
            expect(user2GroupEpisodes).not.toContain(episode);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty results for non-existent groups', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        async (userId, nonExistentGroupName) => {
          // Property: Non-existent group should return empty episodes
          const episodes = await fragmentGroupService.getEpisodesInGroup(userId, nonExistentGroupName);
          expect(episodes).toEqual([]);

          // Property: Episode check should return false for non-existent group
          const isInGroup = await fragmentGroupService.isEpisodeInGroup(
            userId,
            nonExistentGroupName,
            'any-episode'
          );
          expect(isInGroup).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
