/**
 * Unit tests for ListProfilesTool
 */

import { ListProfilesTool } from '../list-profiles-tool';
import { profileService } from '../../../../services/profile-service';
import { CharacterProfile, LocationProfile } from '@cicada/shared-types';

// Mock the profile service
jest.mock('../../../../services/profile-service', () => ({
  profileService: {
    listProfilesByUser: jest.fn(),
    listProfilesByType: jest.fn(),
  },
}));

describe('ListProfilesTool', () => {
  let tool: ListProfilesTool;
  const mockContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
  };

  beforeEach(() => {
    tool = new ListProfilesTool();
    jest.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('listProfiles');
      expect(tool.description).toContain('List all profiles');
    });
  });

  describe('Execute - List All Profiles', () => {
    it('should list all profiles for a user', async () => {
      const mockProfiles: (CharacterProfile | LocationProfile)[] = [
        {
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
        },
        {
          profileId: 'hinamizawa',
          profileType: 'LOCATION',
          userId: 'test-user-123',
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          locationName: 'Hinamizawa',
          description: 'A small village',
          appearances: [],
          significance: 'Main setting',
        },
      ];

      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.profiles).toEqual(mockProfiles);
      expect(result.data?.count).toBe(2);
      expect(result.data?.profileType).toBeUndefined();
      expect(profileService.listProfilesByUser).toHaveBeenCalledWith('test-user-123');
    });

    it('should return empty array when user has no profiles', async () => {
      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.profiles).toEqual([]);
      expect(result.data?.count).toBe(0);
    });
  });

  describe('Execute - List Profiles by Type', () => {
    it('should list CHARACTER profiles only', async () => {
      const mockProfiles: CharacterProfile[] = [
        {
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
        },
        {
          profileId: 'mion',
          profileType: 'CHARACTER',
          userId: 'test-user-123',
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          characterName: 'Mion Sonozaki',
          appearances: [],
          relationships: [],
          traits: [],
          knownFacts: [],
        },
      ];

      (profileService.listProfilesByType as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await tool.execute(
        {
          profileType: 'CHARACTER',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.profiles).toEqual(mockProfiles);
      expect(result.data?.count).toBe(2);
      expect(result.data?.profileType).toBe('CHARACTER');
      expect(profileService.listProfilesByType).toHaveBeenCalledWith(
        'test-user-123',
        'CHARACTER'
      );
    });

    it.each([
      'CHARACTER',
      'LOCATION',
      'EPISODE',
      'FRAGMENT_GROUP',
      'THEORY',
    ])('should support %s profile type', async (profileType) => {
      (profileService.listProfilesByType as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute(
        {
          profileType: profileType as any,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(profileService.listProfilesByType).toHaveBeenCalledWith(
        'test-user-123',
        profileType
      );
    });

    it('should return empty array when no profiles of type exist', async () => {
      (profileService.listProfilesByType as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute(
        {
          profileType: 'THEORY',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.profiles).toEqual([]);
      expect(result.data?.count).toBe(0);
      expect(result.data?.profileType).toBe('THEORY');
    });
  });

  describe('User Isolation', () => {
    it('should only list profiles for the requesting user', async () => {
      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue([]);

      await tool.execute({}, mockContext);

      expect(profileService.listProfilesByUser).toHaveBeenCalledWith(mockContext.userId);
    });

    it('should enforce user isolation when listing by type', async () => {
      (profileService.listProfilesByType as jest.Mock).mockResolvedValue([]);

      await tool.execute(
        {
          profileType: 'CHARACTER',
        },
        mockContext
      );

      expect(profileService.listProfilesByType).toHaveBeenCalledWith(
        mockContext.userId,
        'CHARACTER'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      (profileService.listProfilesByUser as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should reject invalid profile type', async () => {
      const result = await tool.execute(
        {
          profileType: 'INVALID_TYPE' as any,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of profiles', async () => {
      const mockProfiles = Array.from({ length: 100 }, (_, i) => ({
        profileId: `profile-${i}`,
        profileType: 'CHARACTER' as const,
        userId: 'test-user-123',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: `Character ${i}`,
        appearances: [],
        relationships: [],
        traits: [],
        knownFacts: [],
      }));

      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(100);
      expect(result.data?.profiles).toHaveLength(100);
    });
  });
});
