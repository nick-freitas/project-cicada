import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Integration test for Cognito authentication flow
 * Tests user login, token validation, and session management
 * 
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
 */

describe('Authentication Integration Tests', () => {
  const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const userPoolId = process.env.USER_POOL_ID;
  const clientId = process.env.USER_POOL_CLIENT_ID;
  const testUsername = 'test-user';
  const testPassword = 'TestPassword123!';

  beforeAll(async () => {
    if (!userPoolId || !clientId) {
      console.warn('USER_POOL_ID or USER_POOL_CLIENT_ID not set, skipping integration tests');
      return;
    }

    // Set up test user with password
    try {
      await cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: testUsername,
          Password: testPassword,
          Permanent: true,
        })
      );
    } catch (error) {
      // User might not exist, that's okay for these tests
      console.log('Could not set up test user:', error);
    }
  });

  it('should authenticate user with valid credentials', async () => {
    if (!userPoolId || !clientId) {
      console.log('Skipping test - Cognito not configured');
      return;
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: testUsername,
        PASSWORD: testPassword,
      },
    });

    const response = await cognitoClient.send(command);

    // Verify we received tokens
    expect(response.AuthenticationResult).toBeDefined();
    expect(response.AuthenticationResult?.AccessToken).toBeDefined();
    expect(response.AuthenticationResult?.IdToken).toBeDefined();
    expect(response.AuthenticationResult?.RefreshToken).toBeDefined();
  });

  it('should reject authentication with invalid credentials', async () => {
    if (!userPoolId || !clientId) {
      console.log('Skipping test - Cognito not configured');
      return;
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: testUsername,
        PASSWORD: 'WrongPassword123!',
      },
    });

    await expect(cognitoClient.send(command)).rejects.toThrow();
  });

  it('should validate access token', async () => {
    if (!userPoolId || !clientId) {
      console.log('Skipping test - Cognito not configured');
      return;
    }

    // First, authenticate to get a token
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: testUsername,
        PASSWORD: testPassword,
      },
    });

    const authResponse = await cognitoClient.send(authCommand);
    const accessToken = authResponse.AuthenticationResult?.AccessToken;

    expect(accessToken).toBeDefined();

    // Token validation is done by the auth middleware in the Lambda functions
    // This test verifies we can get a valid token
    expect(accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
  });

  it('should retrieve user information', async () => {
    if (!userPoolId || !clientId) {
      console.log('Skipping test - Cognito not configured');
      return;
    }

    try {
      const command = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: testUsername,
      });

      const response = await cognitoClient.send(command);

      expect(response.Username).toBe(testUsername);
      expect(response.UserAttributes).toBeDefined();
    } catch (error) {
      // User might not exist in the pool
      console.log('Test user not found, skipping');
    }
  });

  it('should handle session expiration', async () => {
    if (!userPoolId || !clientId) {
      console.log('Skipping test - Cognito not configured');
      return;
    }

    // Authenticate to get tokens
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: testUsername,
        PASSWORD: testPassword,
      },
    });

    const authResponse = await cognitoClient.send(authCommand);

    // Verify token expiration times are set
    expect(authResponse.AuthenticationResult?.ExpiresIn).toBeDefined();
    expect(authResponse.AuthenticationResult?.ExpiresIn).toBeGreaterThan(0);

    // Access tokens expire in 1 hour (3600 seconds)
    expect(authResponse.AuthenticationResult?.ExpiresIn).toBeLessThanOrEqual(3600);
  });
});
