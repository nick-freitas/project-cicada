/**
 * Unit tests for UpdateProfileTool
 */

import { UpdateProfileTool } from '../update-profile-tool';
import { profileService } from '../../../../services/profile-service';
import { CharacterProfile } from '@cicada/shared-types';

// Mock the profile service
jest.mock('../../../../services/profile-service', () => ({
  profileService: {
    updateProfile: jest.fn(),
  },
}));

describe('UpdateProfileTool', () => {
  let tool: UpdateProfileTool;
  const mockContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
  };

  beforeEach(() => {
    tool = new UpdateProfileTool();
    jest.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('updateProfile');
      expect(tool.description).toContain('Update an existing profile');
    });
  });

  describe('Execute', () => {
    it('should update a profile successfully', async () => {
      const mockProfile: CharacterProfile = {
        profileId: 'rena',
        profileType: 'CHARACTER',
        userId: 'test-user-123',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [],
        relationships: [],
        traits: ['kind', 'mysterious', 'protective'],
        knownFacts: [],
      };

      const updatedProfile = {
        ...mockProfile,
        updatedAt: '2024-01-02T00:00:00Z',
      };

      (profileService.updateProfile as jest.Mock).mockResolvedValue(updatedProfile);

      const result = await tool.execute(
        {
          profile: mockProfile,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.profile).toEqual(updatedProfile);
      expect(result.data?.updated).toBe(true);
      expect(profileService.updateProfile).toHaveBeenCalledWith(mockProfile);
    });

    it('should enforce user isolation - reject profile from different user', async () => {
      const mockProfile: CharacterProfile = {
        profileId: 'rena',
        profileType: 'CHARACTER',
        userId: 'different-user-456', // Different user!
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [],
        relationships: [],
        traits: [],
        knownFacts: [],
      };

      const result = await tool.execute(
        {
          profile: mockProfile,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User isolation violation');
      expect(profileService.updateProfile).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      const mockProfile: CharacterProfile = {
        profileId: 'rena',
        profileType: 'CHARACTER',
        userId: 'test-user-123',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [],
        relationships: [],
        traits: [],
        knownFacts: [],
      };

      (profileService.updateProfile as jest.Mock).mockRejectedValue(
        new Error('Profile does not exist')
      );

      const result = await tool.execute(
        {
          profile: mockProfile,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Profile does not exist');
    });

    it('should validate input schema - require all base fields', async () => {
      const result = await tool.execute(
        {
          profile: {
            profileId: 'rena',
            profileType: 'CHARACTER',
            // Missing userId, version, createdAt, updatedAt
          },
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid profile type', async () => {
      const result = await tool.execute(
        {
          profile: {
            profileId: 'test',
            profileType: 'INVALID_TYPE',
            userId: 'test-user-123',
            version: 1,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should allow additional fields for specific profile types', async () => {
      const mockProfile: CharacterProfile = {
        profileId: 'rena',
        profileType: 'CHARACTER',
        userId: 'test-user-123',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [
          {
            episodeId: 'onikakushi',
            notes: 'First appearance',
            citations: [],
          },
        ],
        relationships: [],
        traits: ['kind'],
        knownFacts: [],
      };

      (profileService.updateProfile as jest.Mock).mockResolvedValue(mockProfile);

      const result = await tool.execute(
        {
          profile: mockProfile,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.profile).toEqual(mockProfile);
    });
  });

  describe('User Isolation', () => {
    it('should only allow updates to profiles owned by the requesting user', async () => {
      const ownProfile: CharacterProfile = {
        profileId: 'rena',
        profileType: 'CHARACTER',
        userId: 'test-user-123',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [],
        relationships: [],
        traits: [],
        knownFacts: [],
      };

      (profileService.updateProfile as jest.Mock).mockResolvedValue(ownProfile);

      const result = await tool.execute(
        {
          profile: ownProfile,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(profileService.updateProfile).toHaveBeenCalled();
    });

    it('should reject updates to profiles owned by other users', async () => {
      const otherUserProfile: CharacterProfile = {
        profileId: 'rena',
        profileType: 'CHARACTER',
        userId: 'other-user-789',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [],
        relationships: [],
        traits: [],
        knownFacts: [],
      };

      const result = await tool.execute(
        {
          profile: otherUserProfile,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User isolation violation');
      expect(profileService.updateProfile).not.toHaveBeenCalled();
    });
  });
});
