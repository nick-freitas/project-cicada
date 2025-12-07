import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ProfileService } from '../../services/profile-service';
import { Profile, ProfileType } from '@cicada/shared-types';

const profileService = new ProfileService();

/**
 * REST API handler for profile management
 * Supports CRUD operations for all profile types
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const { httpMethod, path, pathParameters, body } = event;

  // Extract userId from authorizer context (will be set by Cognito)
  const userId = event.requestContext.authorizer?.claims?.sub || 'anonymous';

  console.log('Profile API request:', { httpMethod, path, userId });

  try {
    // CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    };

    // Handle OPTIONS for CORS preflight
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    // Route to appropriate handler
    if (path.startsWith('/profiles')) {
      return await handleProfilesRoute(httpMethod, pathParameters, body, userId, headers);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    console.error('Error handling profile request:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

async function handleProfilesRoute(
  method: string,
  pathParameters: Record<string, string | undefined> | null,
  body: string | null,
  userId: string,
  headers: { [key: string]: string }
): Promise<APIGatewayProxyResult> {
  const profileType = pathParameters?.profileType;
  const profileId = pathParameters?.profileId;

  // GET /profiles - List all profiles for user
  if (method === 'GET' && !profileType && !profileId) {
    const profiles = await profileService.listProfilesByUser(userId);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ profiles }),
    };
  }

  // GET /profiles/{profileType} - List profiles by type
  if (method === 'GET' && profileType && !profileId) {
    const profiles = await profileService.listProfilesByType(userId, profileType.toUpperCase());
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ profiles }),
    };
  }

  // GET /profiles/{profileType}/{profileId} - Get specific profile
  if (method === 'GET' && profileType && profileId) {
    const profile = await profileService.getProfile(userId, profileType.toUpperCase(), profileId);

    if (!profile) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Profile not found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ profile }),
    };
  }

  // POST /profiles/{profileType} - Create new profile
  if (method === 'POST' && profileType && !profileId && body) {
    const profileData = JSON.parse(body);

    // Create profile object with required fields
    const profile: Omit<Profile, 'version' | 'createdAt' | 'updatedAt'> = {
      userId,
      profileType: profileType.toUpperCase() as ProfileType,
      profileId: profileData.profileId || `${profileType}-${Date.now()}`,
      ...profileData,
    };

    const created = await profileService.createProfile(profile);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ profile: created }),
    };
  }

  // PUT /profiles/{profileType}/{profileId} - Update profile
  if (method === 'PUT' && profileType && profileId && body) {
    const updates = JSON.parse(body);

    // Get existing profile
    const existing = await profileService.getProfile(userId, profileType.toUpperCase(), profileId);

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Profile not found' }),
      };
    }

    // Merge updates with existing profile
    const updated: Profile = {
      ...existing,
      ...updates,
      userId, // Ensure userId doesn't change
      profileType: existing.profileType, // Ensure profileType doesn't change
      profileId: existing.profileId, // Ensure profileId doesn't change
    };

    const result = await profileService.updateProfile(updated);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ profile: result }),
    };
  }

  // DELETE /profiles/{profileType}/{profileId} - Delete profile
  if (method === 'DELETE' && profileType && profileId) {
    await profileService.deleteProfile(userId, profileType.toUpperCase(), profileId);

    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ error: 'Invalid request' }),
  };
}
