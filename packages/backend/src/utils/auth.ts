import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from './logger';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';

// Create JWT verifier
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'access',
  clientId: CLIENT_ID,
});

export interface AuthenticatedUser {
  userId: string;
  username: string;
  email?: string;
}

/**
 * Extract and verify JWT token from Authorization header
 */
export async function verifyToken(event: APIGatewayProxyEvent): Promise<AuthenticatedUser> {
  const authHeader = event.headers.Authorization || event.headers.authorization;

  if (!authHeader) {
    throw new Error('No authorization header provided');
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = await verifier.verify(token);

    return {
      userId: payload.sub,
      username: payload.username || payload.sub,
      email: payload.email,
    };
  } catch (error) {
    logger.error('Token verification failed', { error });
    throw new Error('Invalid or expired token');
  }
}

/**
 * Middleware to authenticate API Gateway requests
 */
export function withAuth(
  handler: (event: APIGatewayProxyEvent, user: AuthenticatedUser) => Promise<APIGatewayProxyResult>
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const user = await verifyToken(event);
      return await handler(event, user);
    } catch (error) {
      logger.error('Authentication failed', { error });
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Unauthorized',
          message: error instanceof Error ? error.message : 'Authentication failed',
        }),
      };
    }
  };
}

/**
 * Extract user ID from WebSocket connection context
 */
export function getUserIdFromWebSocket(event: any): string {
  // In WebSocket, user info is stored in the connection context after authentication
  const userId = event.requestContext?.authorizer?.userId;

  if (!userId) {
    throw new Error('User not authenticated');
  }

  return userId;
}
