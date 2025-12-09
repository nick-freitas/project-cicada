/**
 * Profile Agent Tests
 * 
 * Unit tests for the Profile Agent and its tools.
 */

import { ProfileAgent } from '../profile-agent';
import { GetProfileTool } from '../tools/get-profile-tool';
import { UpdateProfileTool } from '../tools/update-profile-tool';
import { ListProfilesTool } from '../tools/list-profiles-tool';
import { profileService } from '../../../services/profile-service';
import { CharacterProfile, TheoryProfile } from '@cicada/shared-types';

// Mock the profile service
jest.mock('../../../services/profile-service', () => ({
  profileService: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    listProfilesByUser: jest.fn(),
    listProfilesByType: jest.fn(),
  },
}));

// Mock the Strands SDK Agent
jest.mock('@strands-agents/sdk', () => ({
  Agent: class MockAgent {
    constructor(config: any) {}
    async invoke(prompt: string) {
      return {
        toString: () => 'Mocked LLM response',
      };
    }
  },
}));

describe('ProfileAgent', () => {
  let agent: ProfileAgent;
  const mockIdentity = {
    userId: 'test-user-123',
    username: 'testuser',
    groups: [],
    attributes: {},
  };
  const mockMemory = {
    userId: 'test-user-123',
    sessionId: 'test-session-123',
    messages: [],
    lastAccessed: new Date(),
  };

  beforeEach(() => {
    agent = new ProfileAgent();
    jest.clearAllMocks();
  });

  describe('Profile Agent Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(agent).toBeDefined();
      expect(agent['agentName']).toBe('CICADA-Profile');
      expect(agent['agentDescription']).toBe('Profile management specialist');
    });

    it('should initialize all tools', () => {
      expect(agent['getProfileTool']).toBeInstanceOf(GetProfileTool);
      expect(agent['updateProfileTool']).toBeInstanceOf(UpdateProfileTool);
      expect(agent['listProfilesTool']).toBeInstanceOf(ListProfilesTool);
    });
  });

  describe('Operation Classification', () => {
    it('should classify GET operations correctly', () => {
      const queries = [
        'Show me Rena\'s character profile',
        'Get the profile for Hinamizawa',
        'View Onikakushi episode profile',
        'Display my theory about loops',
      ];

      queries.forEach(query => {
        const operation = agent['classifyProfileOperation'](query);
        expect(operation.type).toBe('GET');
      });
    });

    it('should classify UPDATE operations correctly', () => {
      const queries = [
        'Update Rena\'s profile',
        'Save changes to Hinamizawa location',
        'Edit the Onikakushi episode profile',
        'Modify my theory',
      ];

      queries.forEach(query => {
        const operation = agent['classifyProfileOperation'](query);
        expect(operation.type).toBe('UPDATE');
      });
    });

    it('should classify LIST operations correctly', () => {
      const queries = [
        'List all my profiles',
        'Show all character profiles',
        'Show me all my theories',
        'What profiles do I have',
      ];

      queries.forEach(query => {
        const operation = agent['classifyProfileOperation'](query);
        expect(operation.type).toBe('LIST');
      });
    });

    it('should extract profile types correctly', () => {
      const testCases = [
        { query: 'Show me character profiles', expected: 'CHARACTER' },
        { query: 'List location profiles', expected: 'LOCATION' },
        { query: 'Get episode profile', expected: 'EPISODE' },
        { query: 'Show fragment profiles', expected: 'FRAGMENT_GROUP' },
        { query: 'List my theories', expected: 'THEORY' },
      ];

      testCases.forEach(({ query, expected }) => {
        const operation = agent['classifyProfileOperation'](query);
        expect(operation.profileType).toBe(expected);
      });
    });
  });

  describe('GET Profile Operations', () => {
    it('should retrieve an existing profile', async () => {
      const mockProfile: CharacterProfile = {
        userId: 'test-user-123',
        profileType: 'CHARACTER',
        profileId: 'rena',
        characterName: 'Rena Ryuugu',
        appearances: [],
        traits: ['Cheerful', 'Suspicious'],
        relationships: [],
        knownFacts: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (profileService.getProfile as jest.Mock).mockResolvedValue(mockProfile);

      const result = await agent.invokeAgent({
        query: 'Show me Rena\'s character profile',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toBeTruthy();
      expect(result.metadata?.agentsInvoked).toContain('ProfileAgent');
      expect(result.metadata?.toolsUsed).toContain('getProfile');
      expect(profileService.getProfile).toHaveBeenCalledWith(
        'test-user-123',
        'CHARACTER',
        expect.any(String)
      );
    });

    it('should handle profile not found', async () => {
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);

      const result = await agent.invokeAgent({
        query: 'Show me Satoko\'s character profile',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('couldn\'t find');
      expect(result.metadata?.toolsUsed).toContain('getProfile');
    });

    it('should request profile type if not specified', async () => {
      const result = await agent.invokeAgent({
        query: 'Show me Rena',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('type of profile');
    });
  });

  describe('UPDATE Profile Operations', () => {
    it('should update an existing profile', async () => {
      const mockProfile: CharacterProfile = {
        userId: 'test-user-123',
        profileType: 'CHARACTER',
        profileId: 'rena',
        characterName: 'Rena Ryuugu',
        aliases: ['Reina'],
        traits: ['Cheerful'],
        relationships: [],
        development: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const updatedProfile: CharacterProfile = {
        ...mockProfile,
        traits: ['Cheerful', 'Suspicious'],
        updatedAt: '2024-01-02T00:00:00Z',
      };

      (profileService.getProfile as jest.Mock).mockResolvedValue(mockProfile);
      (profileService.updateProfile as jest.Mock).mockResolvedValue(updatedProfile);

      // Mock LLM response to extract update info
      const mockInvoke = jest.spyOn(agent as any, 'invoke');
      mockInvoke.mockResolvedValue({
        toString: () => JSON.stringify({
          profileType: 'CHARACTER',
          profileId: 'rena',
          updates: { traits: ['Cheerful', 'Suspicious'] }
        }),
      });

      const result = await agent.invokeAgent({
        query: 'Update Rena\'s profile to add suspicious trait',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('updated successfully');
      expect(result.metadata?.toolsUsed).toContain('updateProfile');
    });

    it('should handle update of non-existent profile', async () => {
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);

      // Mock LLM response
      const mockInvoke = jest.spyOn(agent as any, 'invoke');
      mockInvoke.mockResolvedValue({
        toString: () => JSON.stringify({
          profileType: 'CHARACTER',
          profileId: 'unknown',
          updates: {}
        }),
      });

      const result = await agent.invokeAgent({
        query: 'Update unknown profile',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('couldn\'t update');
    });
  });

  describe('LIST Profile Operations', () => {
    it('should list all profiles for a user', async () => {
      const mockProfiles: CharacterProfile[] = [
        {
          userId: 'test-user-123',
          profileType: 'CHARACTER',
          profileId: 'rena',
          characterName: 'Rena Ryuugu',
          aliases: [],
          traits: [],
          relationships: [],
          development: [],
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          userId: 'test-user-123',
          profileType: 'CHARACTER',
          profileId: 'mion',
          characterName: 'Mion Sonozaki',
          aliases: [],
          traits: [],
          relationships: [],
          development: [],
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await agent.invokeAgent({
        query: 'List all my profiles',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toBeTruthy();
      expect(result.metadata?.toolsUsed).toContain('listProfiles');
      expect(profileService.listProfilesByUser).toHaveBeenCalledWith('test-user-123');
    });

    it('should list profiles by type', async () => {
      const mockProfiles: TheoryProfile[] = [
        {
          userId: 'test-user-123',
          profileType: 'THEORY',
          profileId: 'loop-theory',
          theoryName: 'Loop Theory',
          description: 'Time loops exist',
          status: 'proposed',
          supportingEvidence: [],
          contradictingEvidence: [],
          refinements: [],
          relatedTheories: [],
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      (profileService.listProfilesByType as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await agent.invokeAgent({
        query: 'List all my theory profiles',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toBeTruthy();
      expect(result.metadata?.toolsUsed).toContain('listProfiles');
      expect(profileService.listProfilesByType).toHaveBeenCalledWith(
        'test-user-123',
        'THEORY'
      );
    });

    it('should handle empty profile list', async () => {
      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue([]);

      const result = await agent.invokeAgent({
        query: 'List all my profiles',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('don\'t have any');
    });
  });

  describe('User Isolation', () => {
    it('should validate user identity', async () => {
      const invalidIdentity = {
        userId: '',
        username: '',
        groups: [],
        attributes: {},
      };

      const result = await agent.invokeAgent({
        query: 'Show me profiles',
        identity: invalidIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('error');
    });

    it('should scope all operations to userId', async () => {
      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue([]);

      await agent.invokeAgent({
        query: 'List all my profiles',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(profileService.listProfilesByUser).toHaveBeenCalledWith('test-user-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      (profileService.getProfile as jest.Mock).mockRejectedValue(
        new Error('DynamoDB error')
      );

      const result = await agent.invokeAgent({
        query: 'Show me Rena\'s profile',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toContain('error');
      expect(result.metadata?.agentsInvoked).toContain('ProfileAgent');
    });

    it('should provide meaningful error messages', async () => {
      (profileService.updateProfile as jest.Mock).mockRejectedValue(
        new Error('Profile not found')
      );

      // Mock LLM response
      const mockInvoke = jest.spyOn(agent as any, 'invoke');
      mockInvoke.mockResolvedValue({
        toString: () => JSON.stringify({
          profileType: 'CHARACTER',
          profileId: 'unknown',
          updates: {}
        }),
      });

      const result = await agent.invokeAgent({
        query: 'Update unknown profile',
        identity: mockIdentity,
        memory: mockMemory,
      });

      expect(result.content).toBeTruthy();
    });
  });
});

describe('Profile Tools', () => {
  const mockContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GetProfileTool', () => {
    it('should retrieve a profile', async () => {
      const tool = new GetProfileTool();
      const mockProfile: CharacterProfile = {
        userId: 'test-user-123',
        profileType: 'CHARACTER',
        profileId: 'rena',
        characterName: 'Rena Ryuugu',
        aliases: [],
        traits: [],
        relationships: [],
        development: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (profileService.getProfile as jest.Mock).mockResolvedValue(mockProfile);

      const result = await tool.execute(
        {
          userId: 'test-user-123',
          profileType: 'CHARACTER',
          profileId: 'rena',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProfile);
    });

    it('should enforce user isolation', async () => {
      const tool = new GetProfileTool();

      const result = await tool.execute(
        {
          userId: 'other-user',
          profileType: 'CHARACTER',
          profileId: 'rena',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User ID mismatch');
    });
  });

  describe('UpdateProfileTool', () => {
    it('should update a profile', async () => {
      const tool = new UpdateProfileTool();
      const mockProfile: CharacterProfile = {
        userId: 'test-user-123',
        profileType: 'CHARACTER',
        profileId: 'rena',
        characterName: 'Rena Ryuugu',
        aliases: [],
        traits: ['Cheerful'],
        relationships: [],
        development: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const updatedProfile: CharacterProfile = {
        ...mockProfile,
        traits: ['Cheerful', 'Suspicious'],
        updatedAt: '2024-01-02T00:00:00Z',
      };

      (profileService.getProfile as jest.Mock).mockResolvedValue(mockProfile);
      (profileService.updateProfile as jest.Mock).mockResolvedValue(updatedProfile);

      const result = await tool.execute(
        {
          userId: 'test-user-123',
          profileType: 'CHARACTER',
          profileId: 'rena',
          updates: { traits: ['Cheerful', 'Suspicious'] },
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.traits).toContain('Suspicious');
    });

    it('should enforce user isolation', async () => {
      const tool = new UpdateProfileTool();

      const result = await tool.execute(
        {
          userId: 'other-user',
          profileType: 'CHARACTER',
          profileId: 'rena',
          updates: {},
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User ID mismatch');
    });
  });

  describe('ListProfilesTool', () => {
    it('should list all profiles', async () => {
      const tool = new ListProfilesTool();
      const mockProfiles: CharacterProfile[] = [
        {
          userId: 'test-user-123',
          profileType: 'CHARACTER',
          profileId: 'rena',
          characterName: 'Rena Ryuugu',
          aliases: [],
          traits: [],
          relationships: [],
          development: [],
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      (profileService.listProfilesByUser as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await tool.execute(
        {
          userId: 'test-user-123',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProfiles);
    });

    it('should list profiles by type', async () => {
      const tool = new ListProfilesTool();
      const mockProfiles: TheoryProfile[] = [];

      (profileService.listProfilesByType as jest.Mock).mockResolvedValue(mockProfiles);

      const result = await tool.execute(
        {
          userId: 'test-user-123',
          profileType: 'THEORY',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProfiles);
      expect(profileService.listProfilesByType).toHaveBeenCalledWith(
        'test-user-123',
        'THEORY'
      );
    });

    it('should enforce user isolation', async () => {
      const tool = new ListProfilesTool();

      const result = await tool.execute(
        {
          userId: 'other-user',
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User ID mismatch');
    });
  });
});
