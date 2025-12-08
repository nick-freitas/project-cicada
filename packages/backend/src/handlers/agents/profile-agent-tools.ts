import { profileService } from '../../services/profile-service';
import {
  Profile,
  CharacterProfile,
  LocationProfile,
  EpisodeProfile,
  FragmentGroupProfile,
  TheoryProfile,
  Citation,
} from '@cicada/shared-types';
import { logger } from '../../utils/logger';

/**
 * Profile Agent Tool Handlers
 * 
 * These handlers implement the tools available to the Profile Agent:
 * - extract_entity: Extract entity information from conversation context
 * - get_profile: Retrieve an existing profile
 * - create_profile: Create a new profile
 * - update_profile: Update an existing profile
 * 
 * Requirement 5.4: Implement tool handlers for Profile Service integration
 */

export interface ExtractEntityInput {
  conversationContext: string;
  citations?: string; // JSON string of Citation[]
  entityType?: 'CHARACTER' | 'LOCATION' | 'EPISODE' | 'FRAGMENT_GROUP' | 'THEORY';
}

export interface GetProfileInput {
  userId: string;
  profileType: string;
  profileId: string;
}

export interface CreateProfileInput {
  userId: string;
  profileType: string;
  profileId: string;
  profileData: string; // JSON string of profile data
}

export interface UpdateProfileInput {
  userId: string;
  profileType: string;
  profileId: string;
  profileData: string; // JSON string of profile data
}

/**
 * Tool: extract_entity
 * Extracts structured entity information from conversation context
 * 
 * Property 30: Profile Information Extraction
 */
export async function extractEntity(input: ExtractEntityInput): Promise<{
  entityType: string;
  entityName: string;
  information: any;
}[]> {
  try {
    logger.info('Profile Agent Tool: extract_entity', {
      contextLength: input.conversationContext.length,
      entityType: input.entityType,
    });

    // Parse citations if provided
    const citations: Citation[] = input.citations ? JSON.parse(input.citations) : [];

    // Extract entities from conversation context
    // This is a simplified extraction - in production, this would use more sophisticated NLP
    const extracted: any[] = [];

    // Look for character mentions
    if (!input.entityType || input.entityType === 'CHARACTER') {
      const characterPattern = /(?:character|person|individual)\s+(?:named\s+)?([A-Z][a-z]+)/gi;
      let match;
      while ((match = characterPattern.exec(input.conversationContext)) !== null) {
        extracted.push({
          entityType: 'CHARACTER',
          entityName: match[1],
          information: {
            traits: [],
            facts: [],
            relationships: [],
          },
        });
      }
    }

    // Look for location mentions
    if (!input.entityType || input.entityType === 'LOCATION') {
      const locationPattern = /(?:location|place|area)\s+(?:named\s+)?([A-Z][a-z]+)/gi;
      let match;
      while ((match = locationPattern.exec(input.conversationContext)) !== null) {
        extracted.push({
          entityType: 'LOCATION',
          entityName: match[1],
          information: {
            description: '',
            significance: '',
          },
        });
      }
    }

    logger.info('Entity extraction completed', {
      extractedCount: extracted.length,
    });

    return extracted;
  } catch (error) {
    logger.error('Error in extract_entity tool', { error, input });
    throw error;
  }
}

/**
 * Tool: get_profile
 * Retrieves an existing profile by userId, profileType, and profileId
 * 
 * Property 32: Profile Usage in Responses
 */
export async function getProfile(input: GetProfileInput): Promise<Profile | null> {
  try {
    logger.info('Profile Agent Tool: get_profile', {
      userId: input.userId,
      profileType: input.profileType,
      profileId: input.profileId,
    });

    const profile = await profileService.getProfile(
      input.userId,
      input.profileType,
      input.profileId
    );

    if (!profile) {
      logger.info('Profile not found', {
        userId: input.userId,
        profileType: input.profileType,
        profileId: input.profileId,
      });
      return null;
    }

    return profile;
  } catch (error) {
    logger.error('Error in get_profile tool', { error, input });
    throw error;
  }
}

/**
 * Tool: create_profile
 * Creates a new profile with the provided data
 * 
 * Property 29: Profile Auto-Creation
 */
export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  try {
    logger.info('Profile Agent Tool: create_profile', {
      userId: input.userId,
      profileType: input.profileType,
      profileId: input.profileId,
    });

    // Parse profile data
    const profileData = JSON.parse(input.profileData);

    // Create the profile
    const profile = await profileService.createProfile({
      userId: input.userId,
      profileType: input.profileType as any,
      profileId: input.profileId,
      ...profileData,
    });

    logger.info('Profile created successfully', {
      userId: input.userId,
      profileType: input.profileType,
      profileId: input.profileId,
    });

    return profile;
  } catch (error) {
    logger.error('Error in create_profile tool', { error, input });
    throw error;
  }
}

/**
 * Tool: update_profile
 * Updates an existing profile with new data
 * 
 * Property 31: Profile Information Updates
 */
export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  try {
    logger.info('Profile Agent Tool: update_profile', {
      userId: input.userId,
      profileType: input.profileType,
      profileId: input.profileId,
    });

    // Get existing profile
    const existingProfile = await profileService.getProfile(
      input.userId,
      input.profileType,
      input.profileId
    );

    if (!existingProfile) {
      throw new Error(`Profile not found: ${input.profileType}#${input.profileId} for user ${input.userId}`);
    }

    // Parse update data
    const updateData = JSON.parse(input.profileData);

    // Merge with existing profile
    const updatedProfile = {
      ...existingProfile,
      ...updateData,
    };

    // Update the profile
    const result = await profileService.updateProfile(updatedProfile);

    logger.info('Profile updated successfully', {
      userId: input.userId,
      profileType: input.profileType,
      profileId: input.profileId,
    });

    return result;
  } catch (error) {
    logger.error('Error in update_profile tool', { error, input });
    throw error;
  }
}

/**
 * Lambda handler for Profile Agent action group
 * Routes tool invocations to the appropriate handler
 */
export async function handler(event: any): Promise<any> {
  try {
    logger.info('Profile Agent action group invoked', {
      actionGroup: event.actionGroup,
      function: event.function,
    });

    const functionName = event.function;
    const parameters = event.parameters || [];

    // Convert parameters array to object
    const input: Record<string, any> = {};
    for (const param of parameters) {
      input[param.name] = param.value;
    }

    let result: any;

    switch (functionName) {
      case 'extract_entity':
        result = await extractEntity(input as ExtractEntityInput);
        break;

      case 'get_profile':
        result = await getProfile(input as GetProfileInput);
        break;

      case 'create_profile':
        result = await createProfile(input as CreateProfileInput);
        break;

      case 'update_profile':
        result = await updateProfile(input as UpdateProfileInput);
        break;

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

    // Return response in the format expected by Bedrock Agents
    // Note: Bedrock agents require TEXT content type, not JSON
    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: functionName,
        functionResponse: {
          responseBody: {
            'TEXT': {
              body: typeof result === 'string' ? result : JSON.stringify(result),
            },
          },
        },
      },
    };
  } catch (error) {
    logger.error('Error in Profile Agent action group handler', { error, event });
    
    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseState: 'FAILURE',
          responseBody: {
            'TEXT': {
              body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          },
        },
      },
    };
  }
}
