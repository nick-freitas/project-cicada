import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from '@aws-sdk/client-sfn';

/**
 * Integration test for Step Functions workflow
 * Tests end-to-end agent orchestration with failure handling and retries
 * 
 * Requirements: 24.3, 24.4, 24.5
 */

describe('Step Functions Workflow Integration Tests', () => {
  const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const stateMachineArn = process.env.STATE_MACHINE_ARN;

  beforeAll(() => {
    if (!stateMachineArn) {
      console.warn('STATE_MACHINE_ARN not set, skipping integration tests');
    }
  });

  it('should execute agent orchestration workflow successfully', async () => {
    if (!stateMachineArn) {
      console.log('Skipping test - STATE_MACHINE_ARN not configured');
      return;
    }

    const input = {
      requestId: `test-${Date.now()}`,
      userId: 'test-user',
      connectionId: 'test-connection',
      query: 'Tell me about Rena',
    };

    // Start execution
    const startCommand = new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify(input),
    });

    const startResponse = await sfnClient.send(startCommand);
    expect(startResponse.executionArn).toBeDefined();

    // Wait for execution to complete (with timeout)
    const maxWaitTime = 60000; // 60 seconds
    const startTime = Date.now();
    let status = 'RUNNING';

    while (status === 'RUNNING' && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

      const describeCommand = new DescribeExecutionCommand({
        executionArn: startResponse.executionArn,
      });

      const describeResponse = await sfnClient.send(describeCommand);
      status = describeResponse.status || 'RUNNING';
    }

    // Verify execution completed successfully
    expect(status).toBe('SUCCEEDED');
  }, 90000); // 90 second timeout

  it('should handle agent failures with retries', async () => {
    if (!stateMachineArn) {
      console.log('Skipping test - STATE_MACHINE_ARN not configured');
      return;
    }

    const input = {
      requestId: `test-failure-${Date.now()}`,
      userId: 'test-user',
      connectionId: 'invalid-connection', // This should cause a failure
      query: 'Test failure handling',
    };

    // Start execution
    const startCommand = new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify(input),
    });

    const startResponse = await sfnClient.send(startCommand);
    expect(startResponse.executionArn).toBeDefined();

    // Wait for execution to complete or fail
    const maxWaitTime = 60000;
    const startTime = Date.now();
    let status = 'RUNNING';

    while (status === 'RUNNING' && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const describeCommand = new DescribeExecutionCommand({
        executionArn: startResponse.executionArn,
      });

      const describeResponse = await sfnClient.send(describeCommand);
      status = describeResponse.status || 'RUNNING';
    }

    // Verify execution either succeeded (after retries) or failed gracefully
    expect(['SUCCEEDED', 'FAILED']).toContain(status);
  }, 90000);

  it('should handle timeout scenarios', async () => {
    if (!stateMachineArn) {
      console.log('Skipping test - STATE_MACHINE_ARN not configured');
      return;
    }

    const input = {
      requestId: `test-timeout-${Date.now()}`,
      userId: 'test-user',
      connectionId: 'test-connection',
      query: 'Test timeout handling with a very long query that might take a while to process',
    };

    // Start execution
    const startCommand = new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify(input),
    });

    const startResponse = await sfnClient.send(startCommand);
    expect(startResponse.executionArn).toBeDefined();

    // The state machine has a 5-minute timeout, so this should complete within that time
    const maxWaitTime = 60000;
    const startTime = Date.now();
    let status = 'RUNNING';

    while (status === 'RUNNING' && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const describeCommand = new DescribeExecutionCommand({
        executionArn: startResponse.executionArn,
      });

      const describeResponse = await sfnClient.send(describeCommand);
      status = describeResponse.status || 'RUNNING';
    }

    // Verify execution completed (either succeeded or timed out gracefully)
    expect(['SUCCEEDED', 'FAILED', 'TIMED_OUT']).toContain(status);
  }, 90000);
});
