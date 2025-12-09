/**
 * User Identity Types for AgentCore
 * 
 * Defines user identity structure for multi-user support,
 * access control, and data isolation.
 */

/**
 * User identity information
 */
export interface UserIdentity {
  /**
   * Unique user identifier (from Cognito)
   */
  userId: string;

  /**
   * Username (human-readable)
   */
  username: string;

  /**
   * User groups for role-based access control
   */
  groups?: string[];

  /**
   * Additional user attributes
   */
  attributes?: Record<string, string>;
}

/**
 * Policy for user access control
 */
export interface UserPolicy {
  /**
   * Agents the user is allowed to access
   */
  allowedAgents: string[];

  /**
   * Data isolation level
   * - 'strict': User can only access their own data
   * - 'shared': User can access shared data
   */
  dataIsolation: 'strict' | 'shared';

  /**
   * Maximum tokens per request
   */
  maxTokens: number;

  /**
   * Rate limit (requests per hour)
   */
  rateLimit: number;
}
