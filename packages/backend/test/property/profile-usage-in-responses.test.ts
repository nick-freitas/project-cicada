import * as fc from 'fast-check';
import { CharacterProfile, LocationProfile, TheoryProfile } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 32: Profile Usage in Responses
 * Validates: Requirements 14.3, 15.3, 16.3, 17.3, 18.3
 * 
 * For any query about an entity, information from that user's profile for that entity
 * SHALL be retrieved and used.
 */

// Set up mocks before any imports
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
import { ProfileAgent } from '../../src/agents/profile-agent';
import { ProfileService } from '../../src/services/profile-service';

describe('Property 32: Profile Usage in Responses', () => {
  let agent: ProfileAgent;
  let service: ProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = new Map();
    agent = new ProfileAgent();
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
            const updatedProfileData = command.input.ExpressionAttributeValues[':profileData'];
            mockProfiles.set(key, {
              ...item,
              profileData: updatedProfileData,
              updatedAt: command.input.ExpressionAttributeValues[':updatedAt'],
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

  it('should retrieve character profile when querying about that character', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
        async (userId, characterName, traits, facts) => {
          const profileId = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Create a character profile
          const profile: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits,
            knownFacts: facts.map(fact => ({
              fact,
              evidence: [],
            })),
          };

          await service.createProfile(profile);

          // Property: Retrieve profile by entity name
          const result = await agent.retrieveProfiles({
            userId,
            entityNames: [characterName],
          });

          // Property: Profile should be retrieved
          expect(result.profiles.length).toBeGreaterThan(0);
          const retrievedProfile = result.profiles[0] as CharacterProfile;

          // Property: Retrieved profile should match the stored profile
          expect(retrievedProfile.userId).toBe(userId);
          expect(retrievedProfile.profileType).toBe('CHARACTER');
          expect(retrievedProfile.characterName).toBe(characterName);
          expect(retrievedProfile.traits).toEqual(traits);
          expect(retrievedProfile.knownFacts.length).toBe(facts.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve location profile when querying about that location', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (userId, locationName, description, significance) => {
          const profileId = locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Create a location profile
          const profile: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'LOCATION',
            locationName,
            description,
            appearances: [],
            significance,
          };

          await service.createProfile(profile);

          // Property: Retrieve profile by entity name
          const result = await agent.retrieveProfiles({
            userId,
            entityNames: [locationName],
          });

          // Property: Profile should be retrieved
          expect(result.profiles.length).toBeGreaterThan(0);
          const retrievedProfile = result.profiles[0] as LocationProfile;

          // Property: Retrieved profile should match the stored profile
          expect(retrievedProfile.userId).toBe(userId);
          expect(retrievedProfile.profileType).toBe('LOCATION');
          expect(retrievedProfile.locationName).toBe(locationName);
          expect(retrievedProfile.description).toBe(description);
          expect(retrievedProfile.significance).toBe(significance);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve theory profile when querying about that theory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (userId, theoryName, description) => {
          const profileId = theoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Create a theory profile
          const profile: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
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

          await service.createProfile(profile);

          // Property: Retrieve profile by entity name
          const result = await agent.retrieveProfiles({
            userId,
            entityNames: [theoryName],
          });

          // Property: Profile should be retrieved
          expect(result.profiles.length).toBeGreaterThan(0);
          const retrievedProfile = result.profiles[0] as TheoryProfile;

          // Property: Retrieved profile should match the stored profile
          expect(retrievedProfile.userId).toBe(userId);
          expect(retrievedProfile.profileType).toBe('THEORY');
          expect(retrievedProfile.theoryName).toBe(theoryName);
          expect(retrievedProfile.description).toBe(description);
          expect(retrievedProfile.status).toBe('proposed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve profile by specific profileType and profileId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 3, maxLength: 30 }),
        fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        async (userId, characterName, traits) => {
          const profileId = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Create a character profile
          const profile: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits,
            knownFacts: [],
          };

          await service.createProfile(profile);

          // Property: Retrieve profile by type and ID
          const result = await agent.retrieveProfiles({
            userId,
            profileType: 'CHARACTER',
            profileId,
          });

          // Property: Exactly one profile should be retrieved
          expect(result.profiles.length).toBe(1);
          const retrievedProfile = result.profiles[0] as CharacterProfile;

          // Property: Retrieved profile should match the stored profile
          expect(retrievedProfile.userId).toBe(userId);
          expect(retrievedProfile.profileType).toBe('CHARACTER');
          expect(retrievedProfile.profileId).toBe(profileId);
          expect(retrievedProfile.characterName).toBe(characterName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve all profiles of a specific type for a user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 2, maxLength: 5 }),
        async (userId, characterNames) => {
          // Create multiple character profiles
          for (const characterName of characterNames) {
            const profileId = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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

            try {
              await service.createProfile(profile);
            } catch (error) {
              // Skip if profile already exists (duplicate names)
            }
          }

          // Property: Retrieve all character profiles for user
          const result = await agent.retrieveProfiles({
            userId,
            profileType: 'CHARACTER',
          });

          // Property: Should retrieve at least as many profiles as unique character names
          const uniqueNames = new Set(characterNames);
          expect(result.profiles.length).toBeGreaterThanOrEqual(uniqueNames.size);

          // Property: All retrieved profiles should be CHARACTER type
          for (const profile of result.profiles) {
            expect(profile.profileType).toBe('CHARACTER');
            expect(profile.userId).toBe(userId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve all profiles for a user regardless of type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.tuple(
          fc.string({ minLength: 3, maxLength: 30 })
            .filter(s => /[a-z]/i.test(s)) // Must contain at least one letter
            .filter(s => s.replace(/[^a-z0-9]+/gi, '').length > 2),
          fc.string({ minLength: 3, maxLength: 30 })
            .filter(s => /[a-z]/i.test(s))
            .filter(s => s.replace(/[^a-z0-9]+/gi, '').length > 2),
          fc.string({ minLength: 3, maxLength: 30 })
            .filter(s => /[a-z]/i.test(s))
            .filter(s => s.replace(/[^a-z0-9]+/gi, '').length > 2)
        ).filter(([char, loc, theory]) => {
          const charId = char.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
          const locId = loc.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
          const theoryId = theory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
          return charId.length > 1 && locId.length > 1 && theoryId.length > 1 &&
                 charId !== locId && charId !== theoryId && locId !== theoryId;
        }),
        async (userId, [characterName, locationName, theoryName]) => {
          // Create profiles of different types
          const charProfileId = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
          const locProfileId = locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
          const theoryProfileId = theoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');

          // Precondition: All profile IDs must be different and non-empty
          fc.pre(charProfileId.length > 1 && locProfileId.length > 1 && theoryProfileId.length > 1);
          fc.pre(charProfileId !== locProfileId && charProfileId !== theoryProfileId && locProfileId !== theoryProfileId);

          const charProfile: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId: charProfileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: [],
            knownFacts: [],
          };

          const locProfile: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId: locProfileId,
            profileType: 'LOCATION',
            locationName,
            description: '',
            appearances: [],
            significance: '',
          };

          const theoryProfile: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId,
            profileId: theoryProfileId,
            profileType: 'THEORY',
            theoryName,
            description: '',
            status: 'proposed',
            supportingEvidence: [],
            contradictingEvidence: [],
            refinements: [],
            relatedTheories: [],
          };

          await service.createProfile(charProfile);
          await service.createProfile(locProfile);
          await service.createProfile(theoryProfile);

          // Property: Retrieve all profiles for user
          const result = await agent.retrieveProfiles({
            userId,
          });

          // Property: Should retrieve all 3 profiles
          expect(result.profiles.length).toBe(3);

          // Property: Should have one of each type
          const types = result.profiles.map(p => p.profileType);
          expect(types).toContain('CHARACTER');
          expect(types).toContain('LOCATION');
          expect(types).toContain('THEORY');

          // Property: All profiles should belong to the user
          for (const profile of result.profiles) {
            expect(profile.userId).toBe(userId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should only retrieve profiles for the specified user, not other users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        fc.string({ minLength: 3, maxLength: 30 }),
        async ([user1, user2], characterName) => {
          const profileId = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Create profiles for both users with the same character name
          const profile1: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user1,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: ['user1-trait'],
            knownFacts: [],
          };

          const profile2: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
            userId: user2,
            profileId,
            profileType: 'CHARACTER',
            characterName,
            appearances: [],
            relationships: [],
            traits: ['user2-trait'],
            knownFacts: [],
          };

          await service.createProfile(profile1);
          await service.createProfile(profile2);

          // Property: User1 should only retrieve their own profile
          const result1 = await agent.retrieveProfiles({
            userId: user1,
            entityNames: [characterName],
          });

          expect(result1.profiles.length).toBe(1);
          expect(result1.profiles[0].userId).toBe(user1);
          expect((result1.profiles[0] as CharacterProfile).traits).toContain('user1-trait');
          expect((result1.profiles[0] as CharacterProfile).traits).not.toContain('user2-trait');

          // Property: User2 should only retrieve their own profile
          const result2 = await agent.retrieveProfiles({
            userId: user2,
            entityNames: [characterName],
          });

          expect(result2.profiles.length).toBe(1);
          expect(result2.profiles[0].userId).toBe(user2);
          expect((result2.profiles[0] as CharacterProfile).traits).toContain('user2-trait');
          expect((result2.profiles[0] as CharacterProfile).traits).not.toContain('user1-trait');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve multiple profiles when querying about multiple entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 2, maxLength: 5 }),
        async (userId, entityNames) => {
          // Create profiles for each entity
          const createdNames = new Set<string>();
          for (const entityName of entityNames) {
            const profileId = entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const profile: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
              userId,
              profileId,
              profileType: 'CHARACTER',
              characterName: entityName,
              appearances: [],
              relationships: [],
              traits: [],
              knownFacts: [],
            };

            try {
              await service.createProfile(profile);
              createdNames.add(entityName);
            } catch (error) {
              // Skip if profile already exists (duplicate names)
            }
          }

          // Property: Retrieve profiles for multiple entities
          const result = await agent.retrieveProfiles({
            userId,
            entityNames,
          });

          // Property: Should retrieve profiles for the created entities
          expect(result.profiles.length).toBeGreaterThanOrEqual(createdNames.size);

          // Property: All retrieved profiles should belong to the user
          for (const profile of result.profiles) {
            expect(profile.userId).toBe(userId);
          }

          // Property: Retrieved profile names should match created entities
          const retrievedNames = result.profiles.map(p => (p as CharacterProfile).characterName);
          for (const name of createdNames) {
            expect(retrievedNames).toContain(name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
