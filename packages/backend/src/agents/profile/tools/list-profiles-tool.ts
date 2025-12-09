/**
 * List Profiles Tool
 * 
 * Lists all profiles or profiles of a specific type for a user.
 * 
 * Requirements: 6.1, 6.2
 */

import { z } from 'zod';
import { CICADAToolBase, ToolExecutionContext } from '../../base/tool-base';
import { profileService } from '../../../services/profile-service';
import { Profile } from '@cicada/shared-types';

/**
 * Input schema for list profiles tool
 */
const listProfilesInputSchema = z.object({
  profileType: z.enum(['CHARACTER', 'LOCATION', 'EPISODE', 'FRAGMENT_GROUP', 'THEORY']).optional(),
});

export type ListProfilesInput = z.infer<typeof listProfilesInputSchema>;

/**
 * Output type for list profiles tool
 */
export interface ListProfilesOutput {
  profiles: Profile[];
  count: number;
  profileType?: string;
}

/**
 * List Profiles Tool
 * 
 * Lists all profiles or profiles of a specific type for a user.
 * User isolation is enforced - only returns profiles belonging to the requesting user.
 */
export class ListProfilesTool extends CICADAToolBase<ListProfilesInput, ListProfilesOutput> {
  constructor() {
    super({
      name: 'listProfiles',
      description: 'List all profiles or profiles of a specific type (CHARACTER, LOCATION, EPISODE, FRAGMENT_GROUP, THEORY). User isolation is enforced.',
      inputSchema: listProfilesInputSchema,
    });
  }

  /**
   * Execute list profiles operation
   */
  protected async executeInternal(
    input: ListProfilesInput,
    context: ToolExecutionContext
  ): Promise<ListProfilesOutput> {
    let profiles: Profile[];

    // List by type or all profiles
    if (input.profileType) {
      profiles = await profileService.listProfilesByType(context.userId, input.profileType);
    } else {
      profiles = await profileService.listProfilesByUser(context.userId);
    }

    return {
      profiles,
      count: profiles.length,
      profileType: input.profileType,
    };
  }

  /**
   * Sanitize input for logging
   */
  protected sanitizeForLogging(input: ListProfilesInput): any {
    return {
      profileType: input.profileType || 'all',
    };
  }
}
