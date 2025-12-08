import * as cdk from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack';
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

  test('APIStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack });
    const stack = new APIStack(app, 'TestAPIStack', { dataStack, agentStack });
    expect(() => app.synth()).not.toThrow();
  });

  test('AuthStack synthesizes without errors', () => {
    const stack = new AuthStack(app, 'TestAuthStack');
    expect(() => app.synth()).not.toThrow();
  });

  test('FrontendStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack });
    const apiStack = new APIStack(app, 'TestAPIStack', { dataStack, agentStack });
    const authStack = new AuthStack(app, 'TestAuthStack');
    const stack = new FrontendStack(app, 'TestFrontendStack', { apiStack, authStack });
    expect(() => app.synth()).not.toThrow();
  });

  test('MonitoringStack synthesizes without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack });
    const apiStack = new APIStack(app, 'TestAPIStack', { dataStack, agentStack });
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      dataStack,
      apiStack,
    });
    expect(() => app.synth()).not.toThrow();
  });

  test('all stacks synthesize together without errors', () => {
    const dataStack = new DataStack(app, 'TestDataStack');
    const agentStack = new AgentStack(app, 'TestAgentStack', { dataStack });
    const authStack = new AuthStack(app, 'TestAuthStack');
    const apiStack = new APIStack(app, 'TestAPIStack', { dataStack, agentStack, authStack });
    const frontendStack = new FrontendStack(app, 'TestFrontendStack', { apiStack, authStack });
    const monitoringStack = new MonitoringStack(app, 'TestMonitoringStack', {
      dataStack,
      apiStack,
    });

    expect(() => app.synth()).not.toThrow();
  });
});
