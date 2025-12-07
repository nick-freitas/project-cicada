#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AgentStack } from '../lib/agent-stack';
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
const dataStack = new DataStack(app, 'CICADADataStack', { env });

// Compute layer - Lambda functions
const computeStack = new ComputeStack(app, 'CICADAComputeStack', {
  env,
  dataStack,
});

// Agent layer - AgentCore agents
const agentStack = new AgentStack(app, 'CICADAAgentStack', {
  env,
  dataStack,
  computeStack,
});

// API layer - API Gateway
const apiStack = new APIStack(app, 'CICADAAPIStack', {
  env,
  computeStack,
  agentStack,
});

// Auth layer - Cognito
const authStack = new AuthStack(app, 'CICADAAuthStack', { env });

// Frontend layer - S3 + CloudFront
const frontendStack = new FrontendStack(app, 'CICADAFrontendStack', {
  env,
  apiStack,
  authStack,
});

// Monitoring layer - CloudWatch
const monitoringStack = new MonitoringStack(app, 'CICADAMonitoringStack', {
  env,
  dataStack,
  computeStack,
  apiStack,
});

app.synth();
