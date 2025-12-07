import * as cdk from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AgentStack } from '../lib/agent-stack';
import { APIStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

describe('CDK Stack Synthesis', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  test('DataStack synthesizes without errors', () => {
    const stack = new DataStack(app, 'TestDataStack');
    expect(() => app.synth()).not.toThrow();
  });

  test('ComputeStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const stack = new ComputeStack(app, 'TestComputeStack', { dataStack });
    expect(() => app.synth()).not.toThrow();
  });

  test('AgentStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const computeStack = new ComputeStack(app, 'TestComputeStack', { dataStack });
    const stack = new AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
    expect(() => app.synth()).not.toThrow();
  });

  test('APIStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const computeStack = new ComputeStack(app, 'TestComputeStack', { dataStack });
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
    const stack = new APIStack(app, 'TestAPIStack', { dataStack, computeStack, agentStack });
    expect(() => app.synth()).not.toThrow();
  });

  test('AuthStack synthesizes without errors', () => {
    const stack = new AuthStack(app, 'TestAuthStack');
    expect(() => app.synth()).not.toThrow();
  });

  test('FrontendStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const computeStack = new ComputeStack(app, 'TestComputeStack', { dataStack });
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
    const apiStack = new APIStack(app, 'TestAPIStack', { dataStack, computeStack, agentStack });
    const authStack = new AuthStack(app, 'TestAuthStack');
    const stack = new FrontendStack(app, 'TestFrontendStack', { apiStack, authStack });
    expect(() => app.synth()).not.toThrow();
  });

  test('MonitoringStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const computeStack = new ComputeStack(app, 'TestComputeStack', { dataStack });
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
    const apiStack = new APIStack(app, 'TestAPIStack', { dataStack, computeStack, agentStack });
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      dataStack,
      computeStack,
      apiStack,
    });
    expect(() => app.synth()).not.toThrow();
  });

  test('all stacks synthesize together without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const computeStack = new ComputeStack(app, 'TestComputeStack', { dataStack });
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
    const apiStack = new APIStack(app, 'TestAPIStack', { dataStack, computeStack, agentStack });
    const authStack = new AuthStack(app, 'TestAuthStack');
    const frontendStack = new FrontendStack(app, 'TestFrontendStack', { apiStack, authStack });
    const monitoringStack = new MonitoringStack(app, 'TestMonitoringStack', {
      dataStack,
      computeStack,
      apiStack,
    });

    expect(() => app.synth()).not.toThrow();
  });
});
