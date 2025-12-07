import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  Profile,
  BaseProfile,
  CharacterProfile,
  LocationProfile,
  EpisodeProfile,
  FragmentGroupProfile,
  TheoryProfile,
} from '@cicada/shared-types';
import { logger } from '../utils/logger';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const CURRENT_PROFILE_VERSION = 1;

export interface ProfileServiceConfig {
  tableName?: string;
}

export class ProfileService {
  private tableName: string;

  constructor(config?: ProfileServiceConfig) {
    this.tableName = config?.tableName || USER_PROFILES_TABLE;
  }

  /**
   * Create a new profile for a user
   * Automatically sets version, createdAt, and updatedAt
   */
  async createProfile(profile: Omit<Profile, 'version' | 'createdAt' | 'updatedAt'>): Promise<Profile> {
    const now = new Date().toISOString();
    const fullProfile: Profile = {
      ...profile,
      version: CURRENT_PROFILE_VERSION,
      createdAt: now,
      updatedAt: now,
    } as Profile;

    const profileKey = `${profile.profileType}#${profile.profileId}`;

    try {
      await docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            userId: profile.userId,
            profileKey,
            profileType: profile.profileType,
            profileId: profile.profileId,
            profileData: fullProfile,
            version: CURRENT_PROFILE_VERSION,
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(profileKey)',
        })
      );

      logger.info('Profile created', {
        userId: profile.userId,
        profileType: profile.profileType,
        profileId: profile.profileId,
      });

      return fullProfile;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Profile already exists: ${profileKey} for user ${profile.userId}`);
      }
      logger.error('Failed to create profile', { error, userId: profile.userId, profileKey });
      throw error;
    }
  }

  /**
   * Get a profile by userId, profileType, and profileId
   */
  async getProfile(userId: string, profileType: string, profileId: string): Promise<Profile | null> {
    const profileKey = `${profileType}#${profileId}`;

    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            userId,
            profileKey,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      // Check if migration is needed
      const storedVersion = result.Item.version || 0;
      if (storedVersion < CURRENT_PROFILE_VERSION) {
        logger.info('Profile needs migration', {
          userId,
          profileKey,
          currentVersion: storedVersion,
          targetVersion: CURRENT_PROFILE_VERSION,
        });
        // Migration would happen here in a real implementation
        // For now, we just return the profile as-is
      }

      return result.Item.profileData as Profile;
    } catch (error) {
      logger.error('Failed to get profile', { error, userId, profileKey });
      throw error;
    }
  }

  /**
   * Update an existing profile
   * Automatically increments updatedAt
   */
  async updateProfile(profile: Profile): Promise<Profile> {
    const now = new Date().toISOString();
    const updatedProfile: Profile = {
      ...profile,
      updatedAt: now,
    };

    const profileKey = `${profile.profileType}#${profile.profileId}`;

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            userId: profile.userId,
            profileKey,
          },
          UpdateExpression: 'SET profileData = :profileData, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':profileData': updatedProfile,
            ':updatedAt': now,
          },
          ConditionExpression: 'attribute_exists(profileKey)',
        })
      );

      logger.info('Profile updated', {
        userId: profile.userId,
        profileType: profile.profileType,
        profileId: profile.profileId,
      });

      return updatedProfile;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Profile does not exist: ${profileKey} for user ${profile.userId}`);
      }
      logger.error('Failed to update profile', { error, userId: profile.userId, profileKey });
      throw error;
    }
  }

  /**
   * Delete a profile
   */
  async deleteProfile(userId: string, profileType: string, profileId: string): Promise<void> {
    const profileKey = `${profileType}#${profileId}`;

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            userId,
            profileKey,
          },
        })
      );

      logger.info('Profile deleted', { userId, profileType, profileId });
    } catch (error) {
      logger.error('Failed to delete profile', { error, userId, profileKey });
      throw error;
    }
  }

  /**
   * List all profiles for a user
   */
  async listProfilesByUser(userId: string): Promise<Profile[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
        })
      );

      return (result.Items || []).map((item) => item.profileData as Profile);
    } catch (error) {
      logger.error('Failed to list profiles by user', { error, userId });
      throw error;
    }
  }

  /**
   * List profiles by type for a user
   */
  async listProfilesByType(userId: string, profileType: string): Promise<Profile[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'userId = :userId AND begins_with(profileKey, :profileType)',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':profileType': `${profileType}#`,
          },
        })
      );

      return (result.Items || []).map((item) => item.profileData as Profile);
    } catch (error) {
      logger.error('Failed to list profiles by type', { error, userId, profileType });
      throw error;
    }
  }

  /**
   * Get or create a profile
   * If the profile doesn't exist, creates it with default values
   */
  async getOrCreateProfile<T extends Profile>(
    userId: string,
    profileType: string,
    profileId: string,
    defaultProfile: Omit<T, 'version' | 'createdAt' | 'updatedAt'>
  ): Promise<T> {
    const existing = await this.getProfile(userId, profileType, profileId);
    if (existing) {
      return existing as T;
    }

    return (await this.createProfile(defaultProfile)) as T;
  }

  /**
   * Migrate a profile from an old version to the current version
   * This is a placeholder for future migration logic
   */
  private async migrateProfile(profile: any, fromVersion: number, toVersion: number): Promise<Profile> {
    logger.info('Migrating profile', { fromVersion, toVersion });

    // Migration logic would go here
    // For now, just return the profile as-is
    return profile;
  }
}

// Export a singleton instance
export const profileService = new ProfileService();
