import { profileService } from './profile-service';
import { FragmentGroupProfile, Citation } from '@cicada/shared-types';
import { logger } from '../utils/logger';

/**
 * Fragment Group Service - Manages fragment group operations
 * 
 * Fragment groups represent collections of episodes that share the same timeline or universe.
 * This service provides high-level operations for creating, updating, and querying fragment groups.
 * 
 * Validates: Requirements 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5
 */
export class FragmentGroupService {
  /**
   * Create a new fragment group
   * Property 17: Fragment Group Persistence
   */
  async createFragmentGroup(
    userId: string,
    groupName: string,
    episodeIds: string[],
    sharedTimeline: string
  ): Promise<FragmentGroupProfile> {
    const profileId = this.generateProfileId(groupName);

    const fragmentGroup: Omit<FragmentGroupProfile, 'version' | 'createdAt' | 'updatedAt'> = {
      userId,
      profileId,
      profileType: 'FRAGMENT_GROUP',
      groupName,
      episodeIds,
      sharedTimeline,
      connections: [],
      divergences: [],
    };

    logger.info('Creating fragment group', {
      userId,
      groupName,
      episodeCount: episodeIds.length,
    });

    const created = await profileService.createProfile(fragmentGroup);
    return created as FragmentGroupProfile;
  }

  /**
   * Get a fragment group by name
   */
  async getFragmentGroup(userId: string, groupName: string): Promise<FragmentGroupProfile | null> {
    const profileId = this.generateProfileId(groupName);
    const profile = await profileService.getProfile(userId, 'FRAGMENT_GROUP', profileId);
    
    if (profile && profile.profileType === 'FRAGMENT_GROUP') {
      return profile as FragmentGroupProfile;
    }
    
    return null;
  }

  /**
   * Update a fragment group
   */
  async updateFragmentGroup(fragmentGroup: FragmentGroupProfile): Promise<FragmentGroupProfile> {
    logger.info('Updating fragment group', {
      userId: fragmentGroup.userId,
      groupName: fragmentGroup.groupName,
      episodeCount: fragmentGroup.episodeIds.length,
    });

    const updated = await profileService.updateProfile(fragmentGroup);
    return updated as FragmentGroupProfile;
  }

  /**
   * Add episodes to a fragment group
   * Property 14: Fragment Group Episode Inclusion
   */
  async addEpisodesToGroup(
    userId: string,
    groupName: string,
    episodeIds: string[]
  ): Promise<FragmentGroupProfile> {
    const group = await this.getFragmentGroup(userId, groupName);
    
    if (!group) {
      throw new Error(`Fragment group not found: ${groupName} for user ${userId}`);
    }

    // Add new episodes, avoiding duplicates
    const existingIds = new Set(group.episodeIds);
    const newIds = episodeIds.filter(id => !existingIds.has(id));
    
    if (newIds.length === 0) {
      logger.info('No new episodes to add', { userId, groupName });
      return group;
    }

    group.episodeIds = [...group.episodeIds, ...newIds];

    logger.info('Adding episodes to fragment group', {
      userId,
      groupName,
      newEpisodeCount: newIds.length,
      totalEpisodeCount: group.episodeIds.length,
    });

    return await this.updateFragmentGroup(group);
  }

  /**
   * Remove episodes from a fragment group
   */
  async removeEpisodesFromGroup(
    userId: string,
    groupName: string,
    episodeIds: string[]
  ): Promise<FragmentGroupProfile> {
    const group = await this.getFragmentGroup(userId, groupName);
    
    if (!group) {
      throw new Error(`Fragment group not found: ${groupName} for user ${userId}`);
    }

    const idsToRemove = new Set(episodeIds);
    group.episodeIds = group.episodeIds.filter(id => !idsToRemove.has(id));

    logger.info('Removing episodes from fragment group', {
      userId,
      groupName,
      removedCount: episodeIds.length,
      remainingCount: group.episodeIds.length,
    });

    return await this.updateFragmentGroup(group);
  }

  /**
   * Add a connection between episodes in a fragment group
   */
  async addConnection(
    userId: string,
    groupName: string,
    description: string,
    evidence: Citation[]
  ): Promise<FragmentGroupProfile> {
    const group = await this.getFragmentGroup(userId, groupName);
    
    if (!group) {
      throw new Error(`Fragment group not found: ${groupName} for user ${userId}`);
    }

    group.connections.push({
      description,
      evidence,
    });

    logger.info('Adding connection to fragment group', {
      userId,
      groupName,
      evidenceCount: evidence.length,
    });

    return await this.updateFragmentGroup(group);
  }

  /**
   * Add a divergence between episodes in a fragment group
   */
  async addDivergence(
    userId: string,
    groupName: string,
    description: string,
    evidence: Citation[]
  ): Promise<FragmentGroupProfile> {
    const group = await this.getFragmentGroup(userId, groupName);
    
    if (!group) {
      throw new Error(`Fragment group not found: ${groupName} for user ${userId}`);
    }

    group.divergences.push({
      description,
      evidence,
    });

    logger.info('Adding divergence to fragment group', {
      userId,
      groupName,
      evidenceCount: evidence.length,
    });

    return await this.updateFragmentGroup(group);
  }

  /**
   * Get all fragment groups for a user
   */
  async listFragmentGroups(userId: string): Promise<FragmentGroupProfile[]> {
    const profiles = await profileService.listProfilesByType(userId, 'FRAGMENT_GROUP');
    return profiles as FragmentGroupProfile[];
  }

  /**
   * Find fragment groups that contain a specific episode
   * Property 15: Fragment Group Scope Limiting
   */
  async findGroupsContainingEpisode(userId: string, episodeId: string): Promise<FragmentGroupProfile[]> {
    const allGroups = await this.listFragmentGroups(userId);
    return allGroups.filter(group => group.episodeIds.includes(episodeId));
  }

  /**
   * Get all episodes from a fragment group
   * Property 14: Fragment Group Episode Inclusion
   */
  async getEpisodesInGroup(userId: string, groupName: string): Promise<string[]> {
    const group = await this.getFragmentGroup(userId, groupName);
    
    if (!group) {
      return [];
    }

    return group.episodeIds;
  }

  /**
   * Check if an episode is in a fragment group
   */
  async isEpisodeInGroup(userId: string, groupName: string, episodeId: string): Promise<boolean> {
    const group = await this.getFragmentGroup(userId, groupName);
    
    if (!group) {
      return false;
    }

    return group.episodeIds.includes(episodeId);
  }

  /**
   * Delete a fragment group
   */
  async deleteFragmentGroup(userId: string, groupName: string): Promise<void> {
    const profileId = this.generateProfileId(groupName);
    
    logger.info('Deleting fragment group', { userId, groupName });
    
    await profileService.deleteProfile(userId, 'FRAGMENT_GROUP', profileId);
  }

  /**
   * Generate a profile ID from group name
   */
  private generateProfileId(groupName: string): string {
    return groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}

// Export singleton instance
export const fragmentGroupService = new FragmentGroupService();
