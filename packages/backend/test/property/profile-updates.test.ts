import * as fc from 'fast-check';
import { CharacterProfile, LocationProfile, TheoryProfile, Citation } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 31: Profile Information Updates
 * Validates: Requirements 14.4, 15.4, 16.4, 17.4, 18.4
 * 
 * For any new information discovered about an entity, only that user's profile SHALL be updated.
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

describe('Property 31: Profile Information Updates', () => {
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
      } catch (error) {
        return Promise.reject(error);
      }
    });
  });

  it('should update only the specific user\'s character profile when new information is added', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async ([user1, user2], characterName, newTrait) => {
          const profileId = characterName.toLowerCase().replace(/\s+/g, '-');

          // Create profiles for both users
          const profile1: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user1,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          const profile2: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user2,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          const created1 = await service.createProfile(profile1);
          const created2 = await service.createProfile(profile2);

          // Update user1's profile with new information
          const updated1 = {
            ...created1,
            traits: [newTrait],
          } as CharacterProfile;

          await service.updateProfile(updated1);

          // Property: User1's profile should have the new trait
          const retrieved1 = (await service.getProfile(user1, 'CHARACTER', profileId)) as CharacterProfile;
          expect(retrieved1?.traits).toContain(newTrait);

          // Property: User2's profile should NOT have the new trait
          const retrieved2 = (await service.getProfile(user2, 'CHARACTER', profileId)) as CharacterProfile;
          expect(retrieved2?.traits).not.toContain(newTrait);
          expect(retrieved2?.traits).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update only the specific user\'s location profile when new information is added', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async ([user1, user2], locationName, newDescription) => {
          const profileId = locationName.toLowerCase().replace(/\s+/g, '-');

          // Create profiles for both users
          const profile1: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user1,
            profileId,
            profileType: 'LOCATION',
            locationName,
            description: '',
            appearances: [],
            significance: '',
          };

          const profile2: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user2,
            profileId,
            profileType: 'LOCATION',
            locationName,
            description: '',
            appearances: [],
            significance: '',
          };

          const created1 = await service.createProfile(profile1);
          const created2 = await service.createProfile(profile2);

          // Update user1's profile with new information
          const updated1 = {
            ...created1,
            description: newDescription,
          } as LocationProfile;

          await service.updateProfile(updated1);

          // Property: User1's profile should have the new description
          const retrieved1 = (await service.getProfile(user1, 'LOCATION', profileId)) as LocationProfile;
          expect(retrieved1?.description).toBe(newDescription);

          // Property: User2's profile should NOT have the new description
          const retrieved2 = (await service.getProfile(user2, 'LOCATION', profileId)) as LocationProfile;
          expect(retrieved2?.description).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update only the specific user\'s theory profile when new evidence is added', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.record({
          episodeId: fc.string({ minLength: 3, maxLength: 20 }),
          episodeName: fc.string({ minLength: 3, maxLength: 30 }),
          chapterId: fc.string({ minLength: 3, maxLength: 20 }),
          messageId: fc.integer({ min: 1, max: 1000 }),
          textENG: fc.string({ minLength: 10, maxLength: 100 }),
        }),
        async ([user1, user2], theoryName, citation) => {
          const profileId = theoryName.toLowerCase().replace(/\s+/g, '-');

          // Create profiles for both users
          const profile1: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user1,
            profileId,
            profileType: 'THEORY',
            theoryName,
            description: 'Test theory',
            status: 'proposed',
            supportingEvidence: [],
            contradictingEvidence: [],
            refinements: [],
            relatedTheories: [],
          };

          const profile2: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user2,
            profileId,
            profileType: 'THEORY',
            theoryName,
            description: 'Test theory',
            status: 'proposed',
            supportingEvidence: [],
            contradictingEvidence: [],
            refinements: [],
            relatedTheories: [],
          };

          const created1 = await service.createProfile(profile1);
          const created2 = await service.createProfile(profile2);

          // Update user1's profile with new evidence
          const newCitation: Citation = {
            episodeId: citation.episodeId,
            episodeName: citation.episodeName,
            chapterId: citation.chapterId,
            messageId: citation.messageId,
            textENG: citation.textENG,
          };

          const updated1 = {
            ...created1,
            supportingEvidence: [newCitation],
          } as TheoryProfile;

          await service.updateProfile(updated1);

          // Property: User1's profile should have the new evidence
          const retrieved1 = (await service.getProfile(user1, 'THEORY', profileId)) as TheoryProfile;
          expect(retrieved1?.supportingEvidence).toHaveLength(1);
          expect(retrieved1?.supportingEvidence[0].messageId).toBe(citation.messageId);

          // Property: User2's profile should NOT have the new evidence
          const retrieved2 = (await service.getProfile(user2, 'THEORY', profileId)) as TheoryProfile;
          expect(retrieved2?.supportingEvidence).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve updatedAt timestamp when updating profiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId, characterName, newTrait) => {
          const profileId = characterName.toLowerCase().replace(/\s+/g, '-');

          // Create profile
          const profile: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          const created = await service.createProfile(profile);
          const originalUpdatedAt = created.updatedAt;

          // Wait a tiny bit to ensure timestamp would change
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Update profile
          const updated = {
            ...created,
            traits: [newTrait],
          } as CharacterProfile;

          await service.updateProfile(updated);

          // Property: updatedAt should be different after update
          const retrieved = (await service.getProfile(userId, 'CHARACTER', profileId)) as CharacterProfile;
          expect(retrieved?.updatedAt).not.toBe(originalUpdatedAt);
          expect(new Date(retrieved!.updatedAt).getTime()).toBeGreaterThan(
            new Date(originalUpdatedAt).getTime()
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not allow updating a profile that does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        async (userId, characterName) => {
          const profileId = characterName.toLowerCase().replace(/\s+/g, '-');

          // Create a profile object without actually storing it
          const profile: CharacterProfile = {
            userId,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: ['new trait'],
            knownFacts: [],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Property: Updating a non-existent profile should fail
          await expect(service.updateProfile(profile)).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
