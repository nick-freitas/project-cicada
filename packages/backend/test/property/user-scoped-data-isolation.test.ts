import * as fc from 'fast-check';
import { CharacterProfile, LocationProfile, TheoryProfile } from '@cicada/shared-types';

/**
 * Feature: project-cicada, Property 25: User-Scoped Data Isolation
 * Validates: Requirements 13.4, 14.3, 14.5
 * 
 * For any user, they SHALL only access profiles and theories associated with their user ID.
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

describe('Property 25: User-Scoped Data Isolation', () => {
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

  it('should only return profiles for the requesting user', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple users
        fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        // Generate profiles for each user
        fc.array(
          fc.record({
            profileType: fc.constantFrom('CHARACTER', 'LOCATION', 'THEORY'),
            profileId: fc.string({ minLength: 5, maxLength: 20 }),
            name: fc.string({ minLength: 3, maxLength: 30 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (userIds, profileTemplates) => {
          // Ensure we have unique user IDs
          const uniqueUserIds = Array.from(new Set(userIds));
          if (uniqueUserIds.length < 2) return;

          // Create profiles for each user
          for (const userId of uniqueUserIds) {
            for (const template of profileTemplates) {
              const profile = createProfileFromTemplate(userId, template);
              try {
                await service.createProfile(profile);
              } catch (error) {
                // Ignore duplicate profile errors
              }
            }
          }

          // Property: Each user should only see their own profiles
          for (const userId of uniqueUserIds) {
            const userProfiles = await service.listProfilesByUser(userId);

            // All returned profiles must belong to this user
            for (const profile of userProfiles) {
              expect(profile.userId).toBe(userId);
            }

            // No profiles from other users should be returned
            const otherUserIds = uniqueUserIds.filter((id) => id !== userId);
            for (const otherUserId of otherUserIds) {
              const hasOtherUserProfile = userProfiles.some((p) => p.userId === otherUserId);
              expect(hasOtherUserProfile).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not allow users to access profiles from other users via getProfile', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two different users
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        // Generate a profile
        fc.record({
          profileType: fc.constantFrom('CHARACTER', 'LOCATION', 'THEORY'),
          profileId: fc.string({ minLength: 5, maxLength: 20 }),
          name: fc.string({ minLength: 3, maxLength: 30 }),
        }),
        async ([user1, user2], template) => {
          // Create a profile for user1
          const profile = createProfileFromTemplate(user1, template);
          await service.createProfile(profile);

          // Property: user2 should not be able to access user1's profile
          const retrievedByUser2 = await service.getProfile(
            user2,
            template.profileType,
            template.profileId
          );

          expect(retrievedByUser2).toBeNull();

          // Property: user1 should be able to access their own profile
          const retrievedByUser1 = await service.getProfile(
            user1,
            template.profileType,
            template.profileId
          );

          expect(retrievedByUser1).not.toBeNull();
          expect(retrievedByUser1?.userId).toBe(user1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain isolation when listing profiles by type', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple users
        fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        // Generate a profile type
        fc.constantFrom('CHARACTER', 'LOCATION', 'THEORY'),
        // Generate profiles
        fc.array(
          fc.record({
            profileId: fc.string({ minLength: 5, maxLength: 20 }),
            name: fc.string({ minLength: 3, maxLength: 30 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (userIds, profileType, profileTemplates) => {
          // Ensure we have unique user IDs
          const uniqueUserIds = Array.from(new Set(userIds));
          if (uniqueUserIds.length < 2) return;

          // Create profiles of the specified type for each user
          for (const userId of uniqueUserIds) {
            for (const template of profileTemplates) {
              const profile = createProfileFromTemplate(userId, {
                ...template,
                profileType,
              });
              try {
                await service.createProfile(profile);
              } catch (error) {
                // Ignore duplicate profile errors
              }
            }
          }

          // Property: Each user should only see their own profiles of this type
          for (const userId of uniqueUserIds) {
            const userProfiles = await service.listProfilesByType(userId, profileType);

            // All returned profiles must belong to this user and be of the correct type
            for (const profile of userProfiles) {
              expect(profile.userId).toBe(userId);
              expect(profile.profileType).toBe(profileType);
            }

            // No profiles from other users should be returned
            const otherUserIds = uniqueUserIds.filter((id) => id !== userId);
            for (const otherUserId of otherUserIds) {
              const hasOtherUserProfile = userProfiles.some((p) => p.userId === otherUserId);
              expect(hasOtherUserProfile).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not allow users to update profiles from other users', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two different users
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ).filter(([u1, u2]) => u1 !== u2),
        // Generate a profile
        fc.record({
          profileType: fc.constantFrom('CHARACTER', 'LOCATION', 'THEORY'),
          profileId: fc.string({ minLength: 5, maxLength: 20 }),
          name: fc.string({ minLength: 3, maxLength: 30 }),
        }),
        async ([user1, user2], template) => {
          // Create a profile for user1
          const profile = createProfileFromTemplate(user1, template);
          const created = await service.createProfile(profile);

          // Attempt to update the profile as user2
          const maliciousUpdate = {
            ...created,
            userId: user2, // Try to claim ownership
          };

          // Property: The update should fail because user2 doesn't own this profile
          await expect(service.updateProfile(maliciousUpdate)).rejects.toThrow();

          // Property: The original profile should remain unchanged
          const original = await service.getProfile(user1, template.profileType, template.profileId);
          expect(original?.userId).toBe(user1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper function to create a profile from a template
 */
function createProfileFromTemplate(
  userId: string,
  template: { profileType: string; profileId: string; name: string }
): any {
  const baseProfile = {
    userId,
    profileId: template.profileId,
    profileType: template.profileType as any,
  };

  switch (template.profileType) {
    case 'CHARACTER':
      return {
        ...baseProfile,
        characterName: template.name,
        appearances: [],
        relationships: [],
        traits: [],
        knownFacts: [],
      } as Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'>;

    case 'LOCATION':
      return {
        ...baseProfile,
        locationName: template.name,
        description: '',
        appearances: [],
        significance: '',
      } as Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'>;

    case 'THEORY':
      return {
        ...baseProfile,
        theoryName: template.name,
        description: '',
        status: 'proposed' as const,
        supportingEvidence: [],
        contradictingEvidence: [],
        refinements: [],
        relatedTheories: [],
      } as Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'>;

    default:
      throw new Error(`Unknown profile type: ${template.profileType}`);
  }
}
