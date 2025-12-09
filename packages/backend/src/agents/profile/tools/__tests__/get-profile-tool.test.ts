/**
 * Unit tests for GetProfileTool
 */

import { GetProfileTool } from '../get-profile-tool';
import { profileService } from '../../../../services/profile-service';
import { CharacterProfile } from '@cicada/shared-types';

// Mock the profile service
jest.mock('../../../../services/profile-service', () => ({
  profileService: {
    getProfile: jest.fn(),
  },
}));

describe('GetProfileTool', () => {
  let tool: GetProfileTool;
  const mockContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
  };

  beforeEach(() => {
    tool = new GetProfileTool();
    jest.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('getProfile');
      expect(tool.description).toContain('Retrieve a specific profile');
    });
  });

  describe('Execute', () => {
    it('should retrieve an existing profile', async () => {
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
        traits: ['kind', 'mysterious'],
        knownFacts: [],
      };

      (profileService.getProfile as jest.Mock).mockResolvedValue(mockProfile);

      const result = await tool.execute(
        {
          profileType: 'CHARACTER',
          profileId: 'rena',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.profile).toEqual(mockProfile);
      expect(result.data?.found).toBe(true);
      expect(profileService.getProfile).toHaveBeenCalledWith(
        'test-user-123',
        'CHARACTER',
        'rena'
      );
    });

    it('should return null for non-existent profile', async () => {
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);

      const result = await tool.execute(
        {
          profileType: 'CHARACTER',
          profileId: 'nonexistent',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.profile).toBeNull();
      expect(result.data?.found).toBe(false);
    });

    it('should enforce user isolation via context', async () => {
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

      (profileService.getProfile as jest.Mock).mockResolvedValue(mockProfile);

      await tool.execute(
        {
          profileType: 'CHARACTER',
          profileId: 'rena',
        },
        mockContext
      );

      // Verify that the service was called with the user ID from context
      expect(profileService.getProfile).toHaveBeenCalledWith(
        mockContext.userId,
        'CHARACTER',
        'rena'
      );
    });

    it('should handle service errors gracefully', async () => {
      (profileService.getProfile as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await tool.execute(
        {
          profileType: 'CHARACTER',
          profileId: 'rena',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should validate input schema', async () => {
      const result = await tool.execute(
        {
          profileType: 'INVALID_TYPE',
          profileId: 'rena',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject empty profile ID', async () => {
      const result = await tool.execute(
        {
          profileType: 'CHARACTER',
          profileId: '',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Profile ID cannot be empty');
    });
  });

  describe('All Profile Types', () => {
    it.each([
      'CHARACTER',
      'LOCATION',
      'EPISODE',
      'FRAGMENT_GROUP',
      'THEORY',
    ])('should support %s profile type', async (profileType) => {
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);

      const result = await tool.execute(
        {
          profileType: profileType as any,
          profileId: 'test-id',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(profileService.getProfile).toHaveBeenCalledWith(
        'test-user-123',
        profileType,
        'test-id'
      );
    });
  });
});
