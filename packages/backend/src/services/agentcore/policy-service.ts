/**
 * AgentCore Policy Service
 * 
 * Manages access control and permissions for multi-user environment.
 * Enforces user data isolation, controls agent access, manages resource
 * permissions, and implements rate limiting.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../../utils/logger';

const POLICY_TABLE_NAME = process.env.POLICY_TABLE_NAME || 'AgentCorePolicies';
const RATE_LIMIT_TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME || 'AgentCoreRateLimits';

/**
 * Data isolation levels
 */
export type DataIsolationLevel = 'strict' | 'shared';

/**
 * Agent policy configuration
 */
export interface AgentPolicy {
  userId: string;
  allowedAgents: string[];
  dataIsolation: DataIsolationLevel;
  maxTokens: number;
  rateLimit: number; // requests per hour
  customPermissions?: Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Rate limit tracking entry
 */
interface RateLimitEntry {
  userId: string;
  windowStart: number; // Unix timestamp in milliseconds
  requestCount: number;
  ttl: number; // DynamoDB TTL
}

/**
 * Policy enforcement result
 */
export interface PolicyEnforcementResult {
  allowed: boolean;
  reason?: string;
  remainingRequests?: number;
}

/**
 * Policy service for AgentCore
 * Handles access control, permissions, and rate limiting
 */
export class PolicyService {
  private docClient: DynamoDBDocumentClient;

  constructor(dynamoClient?: DynamoDBClient) {
    const client = dynamoClient || new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);

    logger.info('PolicyService initialized', {
      policyTable: POLICY_TABLE_NAME,
      rateLimitTable: RATE_LIMIT_TABLE_NAME,
    });
  }

  /**
   * Get policy for a user
   * 
   * Loads user-specific policy configuration. If no custom policy exists,
   * returns a default policy with standard permissions.
   * 
   * Requirement 10.1: Define policies with allowed agents, data isolation, and rate limits
   * 
   * @param userId - The user's unique identifier
   * @returns AgentPolicy object
   */
  async getPolicy(userId: string): Promise<AgentPolicy> {
    logger.info('Getting policy for user', { userId });

    try {
      // Try to load custom policy from DynamoDB
      const result = await this.docClient.send(
        new GetCommand({
          TableName: POLICY_TABLE_NAME,
          Key: { userId },
        })
      );

      if (result.Item) {
        logger.debug('Custom policy found', {
          userId,
          allowedAgents: result.Item.allowedAgents,
          dataIsolation: result.Item.dataIsolation,
        });
        return result.Item as AgentPolicy;
      }

      // Return default policy if no custom policy exists
      const defaultPolicy = this.getDefaultPolicy(userId);
      logger.debug('Using default policy', {
        userId,
        allowedAgents: defaultPolicy.allowedAgents,
        dataIsolation: defaultPolicy.dataIsolation,
      });

      return defaultPolicy;
    } catch (error) {
      logger.error('Error loading policy, using default', error, { userId });
      return this.getDefaultPolicy(userId);
    }
  }

  /**
   * Enforce policy for a request
   * 
   * Validates that the request complies with the user's policy:
   * - Checks rate limits
   * - Validates agent access
   * - Enforces data isolation
   * 
   * Requirements:
   * - 10.2: Enforce user policy on requests
   * - 10.3: Enforce data isolation (strict mode)
   * - 10.4: Implement rate limiting
   * 
   * @param policy - The user's policy
   * @param request - Request details to validate
   * @returns PolicyEnforcementResult indicating if request is allowed
   */
  async enforcePolicy(
    policy: AgentPolicy,
    request: {
      userId: string;
      agentName?: string;
      targetUserId?: string;
    }
  ): Promise<PolicyEnforcementResult> {
    logger.info('Enforcing policy', {
      userId: request.userId,
      agentName: request.agentName,
      dataIsolation: policy.dataIsolation,
    });

    // 1. Check rate limit (Requirement 10.4)
    const rateLimitResult = await this.checkRateLimit(policy);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', {
        userId: request.userId,
        rateLimit: policy.rateLimit,
      });
      return rateLimitResult;
    }

    // 2. Validate agent access
    if (request.agentName && !policy.allowedAgents.includes(request.agentName)) {
      logger.warn('Agent access denied', {
        userId: request.userId,
        agentName: request.agentName,
        allowedAgents: policy.allowedAgents,
      });
      return {
        allowed: false,
        reason: `Access to agent '${request.agentName}' is not permitted`,
      };
    }

    // 3. Enforce data isolation (Requirement 10.3)
    if (policy.dataIsolation === 'strict') {
      // In strict mode, users can only access their own data
      if (request.targetUserId && request.targetUserId !== request.userId) {
        logger.warn('Data isolation violation', {
          userId: request.userId,
          targetUserId: request.targetUserId,
          dataIsolation: policy.dataIsolation,
        });
        return {
          allowed: false,
          reason: 'Cannot access data belonging to other users (strict isolation)',
        };
      }
    }

    // All checks passed
    logger.debug('Policy enforcement passed', {
      userId: request.userId,
      remainingRequests: rateLimitResult.remainingRequests,
    });

    return {
      allowed: true,
      remainingRequests: rateLimitResult.remainingRequests,
    };
  }

  /**
   * Check rate limit for a user
   * 
   * Implements sliding window rate limiting. Tracks request count per hour
   * and rejects requests that exceed the limit.
   * 
   * Requirement 10.4: Implement rate limiting
   * 
   * @param policy - The user's policy
   * @returns PolicyEnforcementResult with rate limit status
   */
  private async checkRateLimit(policy: AgentPolicy): Promise<PolicyEnforcementResult> {
    const now = Date.now();
    const windowStart = now - 3600000; // 1 hour ago
    const userId = policy.userId;

    try {
      // Get current rate limit entry
      const result = await this.docClient.send(
        new GetCommand({
          TableName: RATE_LIMIT_TABLE_NAME,
          Key: { userId },
        })
      );

      let entry = result.Item as RateLimitEntry | undefined;

      // If no entry exists or window has expired, create new entry
      if (!entry || entry.windowStart < windowStart) {
        entry = {
          userId,
          windowStart: now,
          requestCount: 1,
          ttl: Math.floor((now + 7200000) / 1000), // 2 hours from now
        };

        await this.docClient.send(
          new PutCommand({
            TableName: RATE_LIMIT_TABLE_NAME,
            Item: entry,
          })
        );

        logger.debug('Rate limit entry created', {
          userId,
          requestCount: 1,
          rateLimit: policy.rateLimit,
        });

        return {
          allowed: true,
          remainingRequests: policy.rateLimit - 1,
        };
      }

      // Check if rate limit exceeded
      if (entry.requestCount >= policy.rateLimit) {
        logger.warn('Rate limit exceeded', {
          userId,
          requestCount: entry.requestCount,
          rateLimit: policy.rateLimit,
        });

        return {
          allowed: false,
          reason: `Rate limit exceeded: ${policy.rateLimit} requests per hour`,
          remainingRequests: 0,
        };
      }

      // Increment request count
      const newCount = entry.requestCount + 1;
      await this.docClient.send(
        new UpdateCommand({
          TableName: RATE_LIMIT_TABLE_NAME,
          Key: { userId },
          UpdateExpression: 'SET requestCount = :count',
          ExpressionAttributeValues: {
            ':count': newCount,
          },
        })
      );

      logger.debug('Rate limit updated', {
        userId,
        requestCount: newCount,
        rateLimit: policy.rateLimit,
      });

      return {
        allowed: true,
        remainingRequests: policy.rateLimit - newCount,
      };
    } catch (error) {
      logger.error('Error checking rate limit, allowing request', error, { userId });
      // On error, allow the request (fail open)
      return {
        allowed: true,
        reason: 'Rate limit check failed, allowing request',
      };
    }
  }

  /**
   * Create or update a policy for a user
   * 
   * @param policy - The policy to save
   */
  async savePolicy(policy: AgentPolicy): Promise<void> {
    logger.info('Saving policy', {
      userId: policy.userId,
      allowedAgents: policy.allowedAgents,
      dataIsolation: policy.dataIsolation,
    });

    const now = new Date().toISOString();
    const policyToSave = {
      ...policy,
      updatedAt: now,
      createdAt: policy.createdAt || now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: POLICY_TABLE_NAME,
          Item: policyToSave,
        })
      );

      logger.info('Policy saved successfully', { userId: policy.userId });
    } catch (error) {
      logger.error('Error saving policy', error, { userId: policy.userId });
      throw new Error(`Failed to save policy for user ${policy.userId}`);
    }
  }

  /**
   * Get default policy for a user
   * 
   * Returns a standard policy with reasonable defaults:
   * - Access to all core agents
   * - Strict data isolation
   * - 100 requests per hour rate limit
   * - 2048 max tokens
   * 
   * @param userId - The user's unique identifier
   * @returns Default AgentPolicy
   */
  private getDefaultPolicy(userId: string): AgentPolicy {
    return {
      userId,
      allowedAgents: ['orchestrator', 'query', 'theory', 'profile'],
      dataIsolation: 'strict',
      maxTokens: 2048,
      rateLimit: 100, // 100 requests per hour
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Reset rate limit for a user (for testing or admin purposes)
   * 
   * @param userId - The user's unique identifier
   */
  async resetRateLimit(userId: string): Promise<void> {
    logger.info('Resetting rate limit', { userId });

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: RATE_LIMIT_TABLE_NAME,
          Item: {
            userId,
            windowStart: Date.now(),
            requestCount: 0,
            ttl: Math.floor((Date.now() + 7200000) / 1000),
          },
        })
      );

      logger.info('Rate limit reset successfully', { userId });
    } catch (error) {
      logger.error('Error resetting rate limit', error, { userId });
      throw new Error(`Failed to reset rate limit for user ${userId}`);
    }
  }
}

// Export singleton instance
export const policyService = new PolicyService();
