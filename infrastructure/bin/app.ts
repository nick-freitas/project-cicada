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
const dataStack = new DataStack(app, 'ProjectCICADADataStack', { env });

// Compute layer - Lambda functions
const computeStack = new ComputeStack(app, 'ProjectCICADAComputeStack', {
  env,
  dataStack,
});

// Agent layer - AgentCore agents
const agentStack = new AgentStack(app, 'ProjectCICADAAgentStack', {
  env,
  dataStack,
  computeStack,
});

// API layer - API Gateway
const apiStack = new APIStack(app, 'ProjectCICADAAPIStack', {
  env,
  computeStack,
  agentStack,
});

// Auth layer - Cognito
const authStack = new AuthStack(app, 'ProjectCICADAAuthStack', { env });

// Frontend layer - S3 + CloudFront
const frontendStack = new FrontendStack(app, 'ProjectCICADAFrontendStack', {
  env,
  apiStack,
  authStack,
});

// Monitoring layer - CloudWatch
const monitoringStack = new MonitoringStack(app, 'ProjectCICADAMonitoringStack', {
  env,
  dataStack,
  computeStack,
  apiStack,
});

app.synth();
