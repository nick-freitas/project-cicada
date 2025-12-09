/**
 * Get Profile Tool
 * 
 * Retrieves a specific profile for a user by profileType and profileId.
 * 
 * Requirements: 6.1, 6.2
 */

import { z } from 'zod';
import { CICADAToolBase, ToolExecutionContext } from '../../base/tool-base';
import { profileService } from '../../../services/profile-service';
import { Profile } from '@cicada/shared-types';

/**
 * Input schema for get profile tool
 */
const getProfileInputSchema = z.object({
  profileType: z.enum(['CHARACTER', 'LOCATION', 'EPISODE', 'FRAGMENT_GROUP', 'THEORY']),
  profileId: z.string().min(1, 'Profile ID cannot be empty'),
});

export type GetProfileInput = z.infer<typeof getProfileInputSchema>;

/**
 * Output type for get profile tool
 */
export interface GetProfileOutput {
  profile: Profile | null;
  found: boolean;
}

/**
 * Get Profile Tool
 * 
 * Retrieves a specific profile for a user.
 * User isolation is enforced - only returns profiles belonging to the requesting user.
 */
export class GetProfileTool extends CICADAToolBase<GetProfileInput, GetProfileOutput> {
  constructor() {
    super({
      name: 'getProfile',
      description: 'Retrieve a specific profile by type and ID. Returns the profile if found, null otherwise.',
      inputSchema: getProfileInputSchema,
    });
  }

  /**
   * Execute get profile operation
   */
  protected async executeInternal(
    input: GetProfileInput,
    context: ToolExecutionContext
  ): Promise<GetProfileOutput> {
    // Get profile with user isolation
    const profile = await profileService.getProfile(
      context.userId,
      input.profileType,
      input.profileId
    );

    return {
      profile,
      found: profile !== null,
    };
  }

  /**
   * Sanitize input for logging
   */
  protected sanitizeForLogging(input: GetProfileInput): any {
    return {
      profileType: input.profileType,
      profileId: input.profileId.substring(0, 50) + (input.profileId.length > 50 ? '...' : ''),
    };
  }
}
