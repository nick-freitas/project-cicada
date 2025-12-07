import * as fc from 'fast-check';
import { CharacterProfile, LocationProfile, EpisodeProfile, FragmentGroupProfile, TheoryProfile } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 29: Profile Auto-Creation
 * Validates: Requirements 14.2, 15.2, 16.2, 17.2, 18.2
 * 
 * For any entity (character, location, episode, fragment group, theory) first mentioned by a user,
 * a profile SHALL be automatically created for that user.
 */

// Set up mock before any imports
let mockProfiles: Map<string, any>;
const mockSend = jest.fn();

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockSend })),
    },
    PutCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'PutCommand' }, input })),
    GetCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'GetCommand' }, input })),
    QueryCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'QueryCommand' }, input })),
    UpdateCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'UpdateCommand' }, input })),
    DeleteCommand: jest.fn().mockImplementation((input) => ({ constructor: { name: 'DeleteCommand' }, input })),
  };
});

// Import after mocks are set up
import { ProfileService } from '../../src/services/profile-service';

describe('Property 29: Profile Auto-Creation', () => {
  let service: ProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = new Map();
    service = new ProfileService();

    // Mock DynamoDB operations to use in-memory storage
    mockSend.mockImplementation((command: any) => {
      const commandName = command.constructor.name;

      try {
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

          // Filter by profileKey prefix if specified
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
            mockProfiles.set(key, {
              ...item,
              ...command.input.ExpressionAttributeValues,
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
      } catch (error) {
        return Promise.reject(error);
      }
    });
  });

  it('should automatically create a character profile when first accessed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        async (userId, characterName) => {
          const profileId = characterName.toLowerCase().replace(/\s+/g, '-');

          // Property: Profile should not exist initially
          const beforeGet = await service.getProfile(userId, 'CHARACTER', profileId);
          expect(beforeGet).toBeNull();

          // Create default profile for auto-creation
          const defaultProfile: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          // Property: getOrCreateProfile should create the profile if it doesn't exist
          const created = await service.getOrCreateProfile(userId, 'CHARACTER', profileId, defaultProfile);

          expect(created).not.toBeNull();
          expect(created.userId).toBe(userId);
          expect(created.profileType).toBe('CHARACTER');
          expect(created.profileId).toBe(profileId);
          expect(created.characterName).toBe(characterName);
          expect(created.version).toBeDefined();
          expect(created.createdAt).toBeDefined();
          expect(created.updatedAt).toBeDefined();

          // Property: Subsequent calls should return the existing profile
          const retrieved = await service.getOrCreateProfile(userId, 'CHARACTER', profileId, defaultProfile);
          expect(retrieved.createdAt).toBe(created.createdAt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should automatically create a location profile when first accessed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        async (userId, locationName) => {
          const profileId = locationName.toLowerCase().replace(/\s+/g, '-');

          // Property: Profile should not exist initially
          const beforeGet = await service.getProfile(userId, 'LOCATION', profileId);
          expect(beforeGet).toBeNull();

          // Create default profile for auto-creation
          const defaultProfile: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'LOCATION',
            locationName,
            description: '',
            appearances: [],
            significance: '',
          };

          // Property: getOrCreateProfile should create the profile if it doesn't exist
          const created = await service.getOrCreateProfile(userId, 'LOCATION', profileId, defaultProfile);

          expect(created).not.toBeNull();
          expect(created.userId).toBe(userId);
          expect(created.profileType).toBe('LOCATION');
          expect(created.profileId).toBe(profileId);
          expect(created.locationName).toBe(locationName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should automatically create an episode profile when first accessed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        async (userId, episodeId, episodeName) => {
          // Property: Profile should not exist initially
          const beforeGet = await service.getProfile(userId, 'EPISODE', episodeId);
          expect(beforeGet).toBeNull();

          // Create default profile for auto-creation
          const defaultProfile: Omit<EpisodeProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId: episodeId,
            profileType: 'EPISODE',
            episodeId,
            episodeName,
            summary: '',
            keyEvents: [],
            characters: [],
            locations: [],
            themes: [],
          };

          // Property: getOrCreateProfile should create the profile if it doesn't exist
          const created = await service.getOrCreateProfile(userId, 'EPISODE', episodeId, defaultProfile);

          expect(created).not.toBeNull();
          expect(created.userId).toBe(userId);
          expect(created.profileType).toBe('EPISODE');
          expect(created.profileId).toBe(episodeId);
          expect(created.episodeId).toBe(episodeId);
          expect(created.episodeName).toBe(episodeName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should automatically create a fragment group profile when first accessed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        async (userId, groupName, episodeIds) => {
          const profileId = groupName.toLowerCase().replace(/\s+/g, '-');

          // Property: Profile should not exist initially
          const beforeGet = await service.getProfile(userId, 'FRAGMENT_GROUP', profileId);
          expect(beforeGet).toBeNull();

          // Create default profile for auto-creation
          const defaultProfile: Omit<FragmentGroupProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'FRAGMENT_GROUP',
            groupName,
            episodeIds,
            sharedTimeline: '',
            connections: [],
            divergences: [],
          };

          // Property: getOrCreateProfile should create the profile if it doesn't exist
          const created = await service.getOrCreateProfile(userId, 'FRAGMENT_GROUP', profileId, defaultProfile);

          expect(created).not.toBeNull();
          expect(created.userId).toBe(userId);
          expect(created.profileType).toBe('FRAGMENT_GROUP');
          expect(created.profileId).toBe(profileId);
          expect(created.groupName).toBe(groupName);
          expect(created.episodeIds).toEqual(episodeIds);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should automatically create a theory profile when first accessed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (userId, theoryName, description) => {
          const profileId = theoryName.toLowerCase().replace(/\s+/g, '-');

          // Property: Profile should not exist initially
          const beforeGet = await service.getProfile(userId, 'THEORY', profileId);
          expect(beforeGet).toBeNull();

          // Create default profile for auto-creation
          const defaultProfile: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'THEORY',
            theoryName,
            description,
            status: 'proposed',
            supportingEvidence: [],
            contradictingEvidence: [],
            refinements: [],
            relatedTheories: [],
          };

          // Property: getOrCreateProfile should create the profile if it doesn't exist
          const created = await service.getOrCreateProfile(userId, 'THEORY', profileId, defaultProfile);

          expect(created).not.toBeNull();
          expect(created.userId).toBe(userId);
          expect(created.profileType).toBe('THEORY');
          expect(created.profileId).toBe(profileId);
          expect(created.theoryName).toBe(theoryName);
          expect(created.description).toBe(description);
          expect(created.status).toBe('proposed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain separate auto-created profiles for different users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }),
        async ([user1, user2], characterName) => {
          const profileId = characterName.toLowerCase().replace(/\s+/g, '-');

          const defaultProfile1: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user1,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          const defaultProfile2: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user2,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          // Property: Each user should get their own profile
          const profile1 = await service.getOrCreateProfile(user1, 'CHARACTER', profileId, defaultProfile1);
          const profile2 = await service.getOrCreateProfile(user2, 'CHARACTER', profileId, defaultProfile2);

          expect(profile1.userId).toBe(user1);
          expect(profile2.userId).toBe(user2);
          expect(profile1.profileId).toBe(profileId);
          expect(profile2.profileId).toBe(profileId);

          // Property: Profiles should be independent - user1 cannot access user2's profile
          const user1CannotAccessUser2Profile = await service.getProfile(user1, 'CHARACTER', profileId);
          const user2CannotAccessUser1Profile = await service.getProfile(user2, 'CHARACTER', profileId);

          expect(user1CannotAccessUser2Profile?.userId).toBe(user1);
          expect(user2CannotAccessUser1Profile?.userId).toBe(user2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
