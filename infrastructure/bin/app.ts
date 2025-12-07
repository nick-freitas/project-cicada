#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack';
import { APIStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Data layer - S3, DynamoDB, Knowledge Base
const dataStack = new DataStack(app, 'ProjectCICADADataStack', { env });

// Auth layer - Cognito
const authStack = new AuthStack(app, 'ProjectCICADAAuthStack', { env });

// API layer - API Gateway + Lambda functions
const apiStack = new APIStack(app, 'ProjectCICADAAPIStack', {
  env,
  dataStack,
  authStack,
});

// Frontend layer - S3 + CloudFront
const frontendStack = new FrontendStack(app, 'ProjectCICADAFrontendStack', {
  env,
  apiStack,
  authStack,
});

// Monitoring layer - CloudWatch + AWS Budgets
const monitoringStack = new MonitoringStack(app, 'ProjectCICADAMonitoringStack', {
  env,
  dataStack,
  apiStack,
  alertEmail: process.env.ALERT_EMAIL,
});

app.synth();
