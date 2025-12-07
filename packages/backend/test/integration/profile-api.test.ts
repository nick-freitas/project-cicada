import { ProfileService } from '../../src/services/profile-service';
import { ProfileType, Profile, CharacterProfile, LocationProfile } from '@cicada/shared-types';

describe('Profile API Integration Tests', () => {
  let profileService: ProfileService;
  const testUserId = 'test-user-profile-api';

  beforeAll(() => {
    profileService = new ProfileService();
  });

  afterEach(async () => {
    // Clean up test profiles
    try {
      const profiles = await profileService.listProfilesByUser(testUserId);
      for (const profile of profiles) {
        await profileService.deleteProfile(testUserId, profile.profileType, profile.profileId);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Profile CRUD Operations', () => {
    it('should create a character profile', async () => {
      const profileData: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-${Date.now()}`,
        characterName: 'Rena Ryuugu',
        traits: ['friendly', 'mysterious'],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };

      const profile = await profileService.createProfile(profileData);

      expect(profile).toBeDefined();
      expect(profile.profileType).toBe(ProfileType.CHARACTER);
      expect(profile.userId).toBe(testUserId);
      expect(profile.profileId).toBeDefined();
    });

    it('should retrieve a profile by ID', async () => {
      const profileData: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-${Date.now()}`,
        characterName: 'Mion Sonozaki',
        traits: ['leader'],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };

      const created = await profileService.createProfile(profileData);

      const retrieved = await profileService.getProfile(
        testUserId,
        ProfileType.CHARACTER,
        created.profileId
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.profileId).toBe(created.profileId);
    });

    it('should update a profile', async () => {
      const profileData: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-${Date.now()}`,
        characterName: 'Satoko Houjou',
        traits: ['clever'],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };

      const created = await profileService.createProfile(profileData) as CharacterProfile;

      const updated: CharacterProfile = {
        ...created,
        traits: ['clever', 'determined'],
      };

      const result = await profileService.updateProfile(updated) as CharacterProfile;

      expect(result.traits).toContain('determined');
    });

    it('should delete a profile', async () => {
      const profileData: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-${Date.now()}`,
        characterName: 'Rika Furude',
        traits: ['mysterious'],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };

      const created = await profileService.createProfile(profileData);

      await profileService.deleteProfile(testUserId, ProfileType.CHARACTER, created.profileId);

      const retrieved = await profileService.getProfile(
        testUserId,
        ProfileType.CHARACTER,
        created.profileId
      );

      expect(retrieved).toBeNull();
    });

    it('should list profiles by type', async () => {
      // Create multiple character profiles
      const char1: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-1-${Date.now()}`,
        characterName: 'Character 1',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      await profileService.createProfile(char1);

      const char2: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-2-${Date.now()}`,
        characterName: 'Character 2',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      await profileService.createProfile(char2);

      // Create a location profile
      const loc: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.LOCATION,
        profileId: `location-${Date.now()}`,
        locationName: 'Hinamizawa',
        description: 'A small village',
        appearances: [],
        significance: 'Main setting',
      };
      await profileService.createProfile(loc);

      const characterProfiles = await profileService.listProfilesByType(
        testUserId,
        ProfileType.CHARACTER
      );

      expect(characterProfiles.length).toBe(2);
      expect(characterProfiles.every((p) => p.profileType === ProfileType.CHARACTER)).toBe(true);
    });

    it('should list all profiles for a user', async () => {
      const char: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-${Date.now()}`,
        characterName: 'Test Character',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      await profileService.createProfile(char);

      const loc: Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.LOCATION,
        profileId: `location-${Date.now()}`,
        locationName: 'Test Location',
        description: 'Test',
        appearances: [],
        significance: 'Test',
      };
      await profileService.createProfile(loc);

      const allProfiles = await profileService.listProfilesByUser(testUserId);

      expect(allProfiles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('User Isolation', () => {
    it('should isolate profiles between different users', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      const char1: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: user1,
        profileType: ProfileType.CHARACTER,
        profileId: `character-user1-${Date.now()}`,
        characterName: 'User 1 Character',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      const profile1 = await profileService.createProfile(char1);

      const char2: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: user2,
        profileType: ProfileType.CHARACTER,
        profileId: `character-user2-${Date.now()}`,
        characterName: 'User 2 Character',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      const profile2 = await profileService.createProfile(char2);

      // User 1 should not see User 2's profiles
      const user1Profiles = await profileService.listProfilesByUser(user1);
      expect(user1Profiles.find((p) => p.profileId === profile2.profileId)).toBeUndefined();

      // User 2 should not see User 1's profiles
      const user2Profiles = await profileService.listProfilesByUser(user2);
      expect(user2Profiles.find((p) => p.profileId === profile1.profileId)).toBeUndefined();

      // Cleanup
      await profileService.deleteProfile(user1, ProfileType.CHARACTER, profile1.profileId);
      await profileService.deleteProfile(user2, ProfileType.CHARACTER, profile2.profileId);
    });

    it('should prevent cross-user profile access', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      const char: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: user1,
        profileType: ProfileType.CHARACTER,
        profileId: `character-crossuser-${Date.now()}`,
        characterName: 'User 1 Character',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      const profile = await profileService.createProfile(char);

      // User 2 should not be able to retrieve User 1's profile
      const retrieved = await profileService.getProfile(
        user2,
        ProfileType.CHARACTER,
        profile.profileId
      );

      expect(retrieved).toBeNull();

      // Cleanup
      await profileService.deleteProfile(user1, ProfileType.CHARACTER, profile.profileId);
    });
  });

  describe('Authentication', () => {
    it('should handle requests with valid user context', async () => {
      const char: Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: testUserId,
        profileType: ProfileType.CHARACTER,
        profileId: `character-auth-${Date.now()}`,
        characterName: 'Authenticated User Character',
        traits: [],
        knownFacts: [],
        appearances: [],
        relationships: [],
      };
      const profile = await profileService.createProfile(char);

      expect(profile.userId).toBe(testUserId);
    });
  });
});
