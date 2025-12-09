/**
 * Update Profile Tool
 * 
 * Updates an existing profile for a user.
 * 
 * Requirements: 6.1, 6.2
 */

import { z } from 'zod';
import { CICADAToolBase, ToolExecutionContext } from '../../base/tool-base';
import { profileService } from '../../../services/profile-service';
import { Profile } from '@cicada/shared-types';

/**
 * Input schema for update profile tool
 * 
 * Accepts a full profile object that will be updated.
 * The profile must include all required fields.
 */
const updateProfileInputSchema = z.object({
  profile: z.object({
    profileId: z.string().min(1),
    profileType: z.enum(['CHARACTER', 'LOCATION', 'EPISODE', 'FRAGMENT_GROUP', 'THEORY']),
    userId: z.string().min(1),
    version: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    // Additional fields are validated by the profile service
  }).passthrough(), // Allow additional fields for specific profile types
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

/**
 * Output type for update profile tool
 */
export interface UpdateProfileOutput {
  profile: Profile;
  updated: boolean;
}

/**
 * Update Profile Tool
 * 
 * Updates an existing profile for a user.
 * User isolation is enforced - only updates profiles belonging to the requesting user.
 * The profile must already exist (use createProfile for new profiles).
 */
export class UpdateProfileTool extends CICADAToolBase<UpdateProfileInput, UpdateProfileOutput> {
  constructor() {
    super({
      name: 'updateProfile',
      description: 'Update an existing profile. The profile must already exist. User isolation is enforced.',
      inputSchema: updateProfileInputSchema,
    });
  }

  /**
   * Execute update profile operation
   */
  protected async executeInternal(
    input: UpdateProfileInput,
    context: ToolExecutionContext
  ): Promise<UpdateProfileOutput> {
    // Enforce user isolation - ensure the profile belongs to the requesting user
    if (input.profile.userId !== context.userId) {
      throw new Error(
        `User isolation violation: Cannot update profile belonging to user ${input.profile.userId}`
      );
    }

    // Update profile
    // The input.profile has been validated by Zod with passthrough(),
    // so it contains all the necessary fields for the specific profile type
    const updatedProfile = await profileService.updateProfile(input.profile as unknown as Profile);

    return {
      profile: updatedProfile,
      updated: true,
    };
  }

  /**
   * Sanitize input for logging
   */
  protected sanitizeForLogging(input: UpdateProfileInput): any {
    return {
      profileType: input.profile.profileType,
      profileId: input.profile.profileId.substring(0, 50) + 
        (input.profile.profileId.length > 50 ? '...' : ''),
      userId: input.profile.userId,
    };
  }
}
