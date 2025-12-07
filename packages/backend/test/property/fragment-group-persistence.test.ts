import * as fc from 'fast-check';
import { FragmentGroupService } from '../../src/services/fragment-group-service';
import { ProfileService } from '../../src/services/profile-service';

/**
 * Feature: project-cicada, Property 17: Fragment Group Persistence
 * Validates: Requirements 10.1, 10.2
 * 
 * For any fragment group created, storing and retrieving it SHALL return the same data.
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

describe('Property 17: Fragment Group Persistence', () => {
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

  it('should persist and retrieve fragment groups with same data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds, sharedTimeline) => {
          // Ensure unique episode IDs
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length > 0);

          // Create fragment group
          const created = await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Property: Retrieve should return same data
          const retrieved = await fragmentGroupService.getFragmentGroup(userId, groupName);

          expect(retrieved).not.toBeNull();
          expect(retrieved?.groupName).toBe(created.groupName);
          expect(retrieved?.episodeIds).toEqual(created.episodeIds);
          expect(retrieved?.sharedTimeline).toBe(created.sharedTimeline);
          expect(retrieved?.profileType).toBe('FRAGMENT_GROUP');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain fragment group data across updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, initialEpisodes, additionalEpisodes, sharedTimeline) => {
          const uniqueInitial = Array.from(new Set(initialEpisodes));
          const uniqueAdditional = Array.from(new Set(additionalEpisodes));
          fc.pre(uniqueInitial.length > 0 && uniqueAdditional.length > 0);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueInitial,
            sharedTimeline
          );

          // Add episodes
          const updated = await fragmentGroupService.addEpisodesToGroup(
            userId,
            groupName,
            uniqueAdditional
          );

          // Property: Retrieved data should include all episodes
          const retrieved = await fragmentGroupService.getFragmentGroup(userId, groupName);

          expect(retrieved).not.toBeNull();
          expect(retrieved?.groupName).toBe(groupName);
          
          // All initial episodes should be present
          for (const episodeId of uniqueInitial) {
            expect(retrieved?.episodeIds).toContain(episodeId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should persist connections and divergences', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (userId, groupName, episodeIds, sharedTimeline, connectionDesc, divergenceDesc) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length > 0);

          // Create fragment group
          await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Add connection
          await fragmentGroupService.addConnection(userId, groupName, connectionDesc, []);

          // Add divergence
          await fragmentGroupService.addDivergence(userId, groupName, divergenceDesc, []);

          // Property: Retrieved group should have connections and divergences
          const retrieved = await fragmentGroupService.getFragmentGroup(userId, groupName);

          expect(retrieved).not.toBeNull();
          expect(retrieved?.connections.length).toBe(1);
          expect(retrieved?.connections[0].description).toBe(connectionDesc);
          expect(retrieved?.divergences.length).toBe(1);
          expect(retrieved?.divergences[0].description).toBe(divergenceDesc);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain user isolation for fragment groups', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5)
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async ([user1, user2], groupName, episodeIds, sharedTimeline) => {
          const uniqueEpisodeIds = Array.from(new Set(episodeIds));
          fc.pre(uniqueEpisodeIds.length > 0);

          // Create fragment group for user1
          await fragmentGroupService.createFragmentGroup(
            user1,
            groupName,
            uniqueEpisodeIds,
            sharedTimeline
          );

          // Property: User2 should not see user1's fragment group
          const user2Group = await fragmentGroupService.getFragmentGroup(user2, groupName);
          expect(user2Group).toBeNull();

          // Property: User1 should still see their fragment group
          const user1Group = await fragmentGroupService.getFragmentGroup(user1, groupName);
          expect(user1Group).not.toBeNull();
          expect(user1Group?.userId).toBe(user1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle deletion and recreation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /[a-zA-Z]/.test(s)),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, groupName, episodeIds1, episodeIds2, sharedTimeline) => {
          const unique1 = Array.from(new Set(episodeIds1));
          const unique2 = Array.from(new Set(episodeIds2));
          fc.pre(unique1.length > 0 && unique2.length > 0);

          // Create fragment group
          const created1 = await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            unique1,
            sharedTimeline
          );

          // Delete it
          await fragmentGroupService.deleteFragmentGroup(userId, groupName);

          // Property: Should not exist after deletion
          const afterDelete = await fragmentGroupService.getFragmentGroup(userId, groupName);
          expect(afterDelete).toBeNull();

          // Recreate with different episodes
          const created2 = await fragmentGroupService.createFragmentGroup(
            userId,
            groupName,
            unique2,
            sharedTimeline
          );

          // Property: New group should have new episodes, not old ones
          const retrieved = await fragmentGroupService.getFragmentGroup(userId, groupName);
          expect(retrieved).not.toBeNull();
          expect(retrieved?.episodeIds).toEqual(unique2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
