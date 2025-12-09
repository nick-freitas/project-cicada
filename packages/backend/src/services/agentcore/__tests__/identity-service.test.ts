/**
 * Unit tests for IdentityService
 */

import { IdentityService, UserIdentity } from '../identity-service';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Mock aws-jwt-verify
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({
      verify: jest.fn(),
    })),
  },
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('IdentityService', () => {
  let identityService: IdentityService;
  let mockVerifier: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock verifier
    mockVerifier = {
      verify: jest.fn(),
    };

    (CognitoJwtVerifier.create as jest.Mock).mockReturnValue(mockVerifier);

    // Create service instance
    identityService = new IdentityService();
  });

  describe('getUserIdentity', () => {
    it('should return basic identity for a userId', async () => {
      const userId = 'user-123';
      const identity = await identityService.getUserIdentity(userId);

      expect(identity).toEqual({
        userId: 'user-123',
        username: 'user-123',
        groups: ['users'],
        attributes: {},
      });
    });

    it('should return identity with correct structure', async () => {
      const identity = await identityService.getUserIdentity('test-user');

      expect(identity).toHaveProperty('userId');
      expect(identity).toHaveProperty('username');
      expect(identity).toHaveProperty('groups');
      expect(identity).toHaveProperty('attributes');
      expect(Array.isArray(identity.groups)).toBe(true);
      expect(typeof identity.attributes).toBe('object');
    });
  });

  describe('getUserIdentityFromToken', () => {
    it('should extract identity from valid token', async () => {
      const mockPayload = {
        sub: 'user-456',
        username: 'john.doe',
        email: 'john@example.com',
        'cognito:groups': ['users', 'admins'],
        'custom:department': 'engineering',
      };

      mockVerifier.verify.mockResolvedValue(mockPayload);

      const identity = await identityService.getUserIdentityFromToken('valid-token');

      expect(identity).toEqual({
        userId: 'user-456',
        username: 'john.doe',
        email: 'john@example.com',
        groups: ['users', 'admins'],
        attributes: {
          department: 'engineering',
        },
      });

      expect(mockVerifier.verify).toHaveBeenCalledWith('valid-token');
    });

    it('should use userId as username if username not in token', async () => {
      const mockPayload = {
        sub: 'user-789',
        'cognito:groups': ['users'],
      };

      mockVerifier.verify.mockResolvedValue(mockPayload);

      const identity = await identityService.getUserIdentityFromToken('token');

      expect(identity.username).toBe('user-789');
    });

    it('should default to users group if no groups in token', async () => {
      const mockPayload = {
        sub: 'user-999',
        username: 'jane',
      };

      mockVerifier.verify.mockResolvedValue(mockPayload);

      const identity = await identityService.getUserIdentityFromToken('token');

      expect(identity.groups).toEqual(['users']);
    });

    it('should throw error for invalid token', async () => {
      mockVerifier.verify.mockRejectedValue(new Error('Token expired'));

      await expect(
        identityService.getUserIdentityFromToken('invalid-token')
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should extract custom attributes correctly', async () => {
      const mockPayload = {
        sub: 'user-111',
        username: 'test',
        'custom:role': 'admin',
        'custom:team': 'backend',
        'cognito:groups': ['users'],
      };

      mockVerifier.verify.mockResolvedValue(mockPayload);

      const identity = await identityService.getUserIdentityFromToken('token');

      expect(identity.attributes).toEqual({
        role: 'admin',
        team: 'backend',
      });
    });
  });

  describe('validateIdentity', () => {
    it('should return true for valid identity', async () => {
      const identity: UserIdentity = {
        userId: 'user-123',
        username: 'john',
        groups: ['users'],
        attributes: {},
      };

      const isValid = await identityService.validateIdentity(identity);

      expect(isValid).toBe(true);
    });

    it('should return false for identity without userId', async () => {
      const identity: UserIdentity = {
        userId: '',
        username: 'john',
        groups: ['users'],
        attributes: {},
      };

      const isValid = await identityService.validateIdentity(identity);

      expect(isValid).toBe(false);
    });

    it('should return false for identity without username', async () => {
      const identity: UserIdentity = {
        userId: 'user-123',
        username: '',
        groups: ['users'],
        attributes: {},
      };

      const isValid = await identityService.validateIdentity(identity);

      expect(isValid).toBe(false);
    });

    it('should return true for identity with all required fields', async () => {
      const identity: UserIdentity = {
        userId: 'user-456',
        username: 'jane.doe',
        email: 'jane@example.com',
        groups: ['users', 'admins'],
        attributes: { role: 'admin' },
      };

      const isValid = await identityService.validateIdentity(identity);

      expect(isValid).toBe(true);
    });
  });

  describe('getUserIdentityFromWebSocket', () => {
    it('should extract identity from WebSocket context', async () => {
      const context = {
        authorizer: {
          userId: 'ws-user-123',
          username: 'websocket-user',
        },
      };

      const identity = await identityService.getUserIdentityFromWebSocket(context);

      expect(identity.userId).toBe('ws-user-123');
      expect(identity.username).toBe('websocket-user');
    });

    it('should throw error if userId not in context', async () => {
      const context = {
        authorizer: {},
      };

      await expect(
        identityService.getUserIdentityFromWebSocket(context)
      ).rejects.toThrow('User not authenticated');
    });

    it('should use default username if not in context', async () => {
      const context = {
        authorizer: {
          userId: 'ws-user-456',
        },
      };

      const identity = await identityService.getUserIdentityFromWebSocket(context);

      expect(identity.userId).toBe('ws-user-456');
      expect(identity.username).toBe('ws-user-456');
    });

    it('should throw error for missing authorizer', async () => {
      const context = {};

      await expect(
        identityService.getUserIdentityFromWebSocket(context)
      ).rejects.toThrow('User not authenticated');
    });
  });
});
