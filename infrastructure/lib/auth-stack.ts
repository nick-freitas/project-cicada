import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'CICADAUserPool', {
      userPoolName: 'CICADA-Users',
      selfSignUpEnabled: false, // Admin creates users
      signInAliases: {
        username: true,
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep user data on stack deletion
    });

    // Create initial users (admin, Nick, Naizak)
    new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'admin',
      userAttributes: [
        {
          name: 'email',
          value: 'admin@project-cicada.com',
        },
        {
          name: 'email_verified',
          value: 'true',
        },
      ],
    });

    new cognito.CfnUserPoolUser(this, 'NickUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'nick',
      userAttributes: [
        {
          name: 'email',
          value: 'nick@project-cicada.com',
        },
        {
          name: 'email_verified',
          value: 'true',
        },
      ],
    });

    new cognito.CfnUserPoolUser(this, 'NaizakUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'naizak',
      userAttributes: [
        {
          name: 'email',
          value: 'naizak@project-cicada.com',
        },
        {
          name: 'email_verified',
          value: 'true',
        },
      ],
    });

    // Create User Pool Client for frontend
    this.userPoolClient = new cognito.UserPoolClient(this, 'CICADAUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'CICADA-Web-Client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // No secret for public clients (web/mobile)
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'CICADAUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'CICADAUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
    });
  }
}
