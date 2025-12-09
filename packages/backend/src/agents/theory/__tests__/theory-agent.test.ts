/**
 * Theory Agent Unit Tests
 * 
 * Tests the Theory Agent's core functionality including:
 * - Evidence gathering via Query Agent
 * - Theory analysis
 * - Profile updates
 * - Error handling
 */

import { TheoryAgent } from '../theory-agent';
import { QueryAgent } from '../../query';
import { profileService } from '../../../services/profile-service';
import { AgentInvocationParams } from '../../base';
import { TheoryProfile } from '@cicada/shared-types';

// Mock Strands SDK
jest.mock('@strands-agents/sdk', () => ({
  Agent: class MockAgent {
    constructor(config: any) {}
    async invoke(prompt: string): Promise<any> {
      return {
        toString: () => 'Mocked analysis result',
      };
    }
  },
}));

// Mock dependencies
jest.mock('../../query');
jest.mock('../../../services/profile-service');

describe('TheoryAgent', () => {
  let theoryAgent: TheoryAgent;
  let mockQueryAgent: jest.Mocked<QueryAgent>;

  const mockIdentity = {
    userId: 'test-user-123',
    username: 'testuser',
  };

  const mockMemory = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    messages: [],
    lastAccessed: new Date(),
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create theory agent
    theoryAgent = new TheoryAgent();

    // Get mocked query agent instance
    mockQueryAgent = (theoryAgent as any).queryAgent as jest.Mocked<QueryAgent>;
  });

  describe('invokeAgent', () => {
    it('should invoke Query Agent to gather evidence', async () => {
      // Mock Query Agent response
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence from script: Rena mentions loops in Episode 5.',
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
        },
      });

      // Mock profile service
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Rena knows about the time loops',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify Query Agent was invoked
      expect(mockQueryAgent.invokeAgent).toHaveBeenCalledTimes(1);
      expect(mockQueryAgent.invokeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('Rena knows about the time loops'),
          identity: mockIdentity,
          memory: mockMemory,
        })
      );
    });

    it('should analyze theory against gathered evidence', async () => {
      // Mock Query Agent response with evidence
      const mockEvidence = 'Evidence: Rena says "I remember everything" in Episode 5.';
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: mockEvidence,
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
        },
      });

      // Mock profile service
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Rena knows about the time loops',
        identity: mockIdentity,
        memory: mockMemory,
      };

      const result = await theoryAgent.invokeAgent(params);

      // Verify result contains analysis
      expect(result.content).toBeTruthy();
      expect(result.metadata?.agentsInvoked).toContain('TheoryAgent');
      expect(result.metadata?.agentsInvoked).toContain('QueryAgent');
    });

    it('should update theory profile after analysis', async () => {
      // Mock Query Agent response
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence from script.',
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
        },
      });

      // Mock profile service
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Rena is suspicious',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify profile was created
      expect(profileService.createProfile).toHaveBeenCalledTimes(1);
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockIdentity.userId,
          profileType: 'THEORY',
          theoryName: 'Rena is suspicious',
        })
      );
    });

    it('should update existing theory profile', async () => {
      // Mock Query Agent response
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'New evidence from script.',
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
        },
      });

      // Mock existing theory profile
      const existingProfile: TheoryProfile = {
        userId: mockIdentity.userId,
        profileType: 'THEORY',
        profileId: 'rena-is-suspicious',
        theoryName: 'Rena is suspicious',
        description: 'Theory about Rena',
        status: 'proposed',
        supportingEvidence: [],
        contradictingEvidence: [],
        refinements: [],
        relatedTheories: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      (profileService.getProfile as jest.Mock).mockResolvedValue(existingProfile);
      (profileService.updateProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Rena is suspicious',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify profile was updated
      expect(profileService.updateProfile).toHaveBeenCalledTimes(1);
      expect(profileService.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockIdentity.userId,
          profileType: 'THEORY',
          theoryName: 'Rena is suspicious',
        })
      );
    });

    it('should handle Query Agent failures gracefully', async () => {
      // Mock Query Agent failure
      mockQueryAgent.invokeAgent = jest.fn().mockRejectedValue(
        new Error('Query Agent failed')
      );

      const params: AgentInvocationParams = {
        query: 'Theory: Test theory',
        identity: mockIdentity,
        memory: mockMemory,
      };

      const result = await theoryAgent.invokeAgent(params);

      // Verify error is handled gracefully
      expect(result.content).toContain('error');
      expect(result.metadata?.agentsInvoked).toContain('TheoryAgent');
    });

    it('should handle profile update failures gracefully', async () => {
      // Mock Query Agent response
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence from script.',
        metadata: {
          agentsInvoked: ['QueryAgent'],
          toolsUsed: ['semanticSearch'],
        },
      });

      // Mock profile service failure
      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockRejectedValue(
        new Error('Profile creation failed')
      );

      const params: AgentInvocationParams = {
        query: 'Theory: Test theory',
        identity: mockIdentity,
        memory: mockMemory,
      };

      // Should not throw - profile update failures are logged but don't fail the operation
      const result = await theoryAgent.invokeAgent(params);

      // Verify analysis still completes
      expect(result.content).toBeTruthy();
      expect(result.metadata?.agentsInvoked).toContain('TheoryAgent');
    });
  });

  describe('theory extraction', () => {
    it('should extract theory from query with "theory:" prefix', async () => {
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence',
        metadata: {},
      });

      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'theory: Rena knows about loops',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify theory was extracted correctly
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          theoryName: 'Rena knows about loops',
        })
      );
    });

    it('should extract theory from query with "hypothesis:" prefix', async () => {
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence',
        metadata: {},
      });

      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'hypothesis: Satoko is the villain',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify theory was extracted correctly
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          theoryName: 'Satoko is the villain',
        })
      );
    });

    it('should extract theory from query with "analyze:" prefix', async () => {
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence',
        metadata: {},
      });

      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'analyze: The curse is real',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify theory was extracted correctly
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          theoryName: 'The curse is real',
        })
      );
    });
  });

  describe('theory status extraction', () => {
    it('should set status to supported for strongly supported theories', async () => {
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence',
        metadata: {},
      });

      // Mock the invoke method to return analysis with validation keywords
      const originalInvoke = (theoryAgent as any).invoke;
      (theoryAgent as any).invoke = jest.fn().mockResolvedValue({
        toString: () => 'This theory is strongly supported by the evidence.',
      });

      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Test theory',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify status is supported
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'supported',
        })
      );

      // Restore original invoke
      (theoryAgent as any).invoke = originalInvoke;
    });

    it('should set status to refuted for contradicted theories', async () => {
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence',
        metadata: {},
      });

      // Mock the invoke method to return analysis with refutation keywords
      const originalInvoke = (theoryAgent as any).invoke;
      (theoryAgent as any).invoke = jest.fn().mockResolvedValue({
        toString: () => 'This theory is refuted by the evidence.',
      });

      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Test theory',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify status is refuted
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'refuted',
        })
      );

      // Restore original invoke
      (theoryAgent as any).invoke = originalInvoke;
    });

    it('should set status to proposed for inconclusive theories', async () => {
      mockQueryAgent.invokeAgent = jest.fn().mockResolvedValue({
        content: 'Evidence',
        metadata: {},
      });

      // Mock the invoke method to return analysis without clear status
      const originalInvoke = (theoryAgent as any).invoke;
      (theoryAgent as any).invoke = jest.fn().mockResolvedValue({
        toString: () => 'The evidence is inconclusive.',
      });

      (profileService.getProfile as jest.Mock).mockResolvedValue(null);
      (profileService.createProfile as jest.Mock).mockResolvedValue({});

      const params: AgentInvocationParams = {
        query: 'Theory: Test theory',
        identity: mockIdentity,
        memory: mockMemory,
      };

      await theoryAgent.invokeAgent(params);

      // Verify status is proposed
      expect(profileService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'proposed',
        })
      );

      // Restore original invoke
      (theoryAgent as any).invoke = originalInvoke;
    });
  });
});
