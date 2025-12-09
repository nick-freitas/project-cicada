/**
 * AgentCore Identity Service
 * 
 * Manages user identity and authentication for multi-user support in AgentCore.
 * Integrates with AWS Cognito for user authentication and provides identity
 * context to all agents in the request chain.
 * 
 * Requirements: 9.1, 9.2
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { logger } from '../../utils/logger';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';

/**
 * User identity information passed to all agents
 */
export interface UserIdentity {
  userId: string;
  username: string;
  email?: string;
  groups: string[];
  attributes: Record<string, string>;
}

/**
 * Identity service for AgentCore
 * Handles user authentication and identity management
 */
export class IdentityService {
  private verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor() {
    // Create JWT verifier for Cognito tokens
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: 'access',
      clientId: CLIENT_ID,
    });

    logger.info('IdentityService initialized', {
      userPoolId: USER_POOL_ID,
      clientId: CLIENT_ID ? '***' : 'not set',
    });
  }

  /**
   * Get user identity from userId
   * 
   * For now, this creates a basic identity object.
   * In production, this would query Cognito or a user database.
   * 
   * @param userId - The user's unique identifier
   * @returns UserIdentity object
   */
  async getUserIdentity(userId: string): Promise<UserIdentity> {
    logger.info('Getting user identity', { userId });

    // TODO: In production, query Cognito or user database for full user details
    // For now, return a basic identity object
    const identity: UserIdentity = {
      userId,
      username: userId, // Default to userId if username not available
      groups: ['users'],
      attributes: {},
    };

    logger.debug('User identity retrieved', {
      userId: identity.userId,
      username: identity.username,
      groupCount: identity.groups.length,
    });

    return identity;
  }

  /**
   * Get user identity from JWT token
   * 
   * Verifies the JWT token and extracts user information from Cognito.
   * 
   * @param token - JWT access token from Cognito
   * @returns UserIdentity object
   * @throws Error if token is invalid or expired
   */
  async getUserIdentityFromToken(token: string): Promise<UserIdentity> {
    logger.info('Verifying token and extracting identity');

    try {
      // Verify token with Cognito
      const payload = await this.verifier.verify(token);

      // Extract user information from token payload
      const identity: UserIdentity = {
        userId: String(payload.sub),
        username: String(payload.username || payload.sub),
        email: typeof payload.email === 'string' ? payload.email : undefined,
        groups: this.extractGroups(payload),
        attributes: this.extractAttributes(payload),
      };

      logger.info('User identity extracted from token', {
        userId: identity.userId,
        username: identity.username,
        groupCount: identity.groups.length,
      });

      return identity;
    } catch (error) {
      logger.error('Token verification failed', { error });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Validate user identity
   * 
   * Checks if the user identity is valid and the user is active.
   * 
   * @param identity - UserIdentity to validate
   * @returns true if valid, false otherwise
   */
  async validateIdentity(identity: UserIdentity): Promise<boolean> {
    logger.info('Validating user identity', { userId: identity.userId });

    // Basic validation
    if (!identity.userId || !identity.username) {
      logger.warn('Invalid identity: missing required fields', {
        hasUserId: !!identity.userId,
        hasUsername: !!identity.username,
      });
      return false;
    }

    // TODO: In production, check if user exists and is active in database
    // For now, accept any identity with required fields

    logger.debug('Identity validation passed', { userId: identity.userId });
    return true;
  }

  /**
   * Extract groups from Cognito token payload
   */
  private extractGroups(payload: any): string[] {
    // Cognito groups are typically in 'cognito:groups' claim
    const groups = payload['cognito:groups'];
    
    if (Array.isArray(groups)) {
      return groups;
    }
    
    // Default to 'users' group if no groups specified
    return ['users'];
  }

  /**
   * Extract custom attributes from Cognito token payload
   */
  private extractAttributes(payload: any): Record<string, string> {
    const attributes: Record<string, string> = {};

    // Extract custom attributes (prefixed with 'custom:')
    for (const [key, value] of Object.entries(payload)) {
      if (key.startsWith('custom:') && typeof value === 'string') {
        const attrName = key.replace('custom:', '');
        attributes[attrName] = value;
      }
    }

    return attributes;
  }

  /**
   * Create identity from WebSocket connection context
   * 
   * Extracts user identity from WebSocket authorizer context.
   * 
   * @param connectionContext - WebSocket connection context
   * @returns UserIdentity object
   * @throws Error if user not authenticated
   */
  async getUserIdentityFromWebSocket(connectionContext: any): Promise<UserIdentity> {
    logger.info('Extracting identity from WebSocket context');

    // Extract userId from authorizer context
    const userId = connectionContext?.authorizer?.userId;
    const username = connectionContext?.authorizer?.username;

    if (!userId) {
      logger.error('User not authenticated in WebSocket connection');
      throw new Error('User not authenticated');
    }

    // Get full identity
    const identity = await this.getUserIdentity(userId);
    
    // Override username if available in context
    if (username) {
      identity.username = username;
    }

    logger.info('Identity extracted from WebSocket', {
      userId: identity.userId,
      username: identity.username,
    });

    return identity;
  }
}

// Export singleton instance
export const identityService = new IdentityService();
