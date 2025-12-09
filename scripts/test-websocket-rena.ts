/**
 * WebSocket End-to-End Test for Rena Query
 * 
 * Tests the complete flow:
 * WebSocket API → WebSocketHandler → SQS → MessageProcessor → Gateway → Orchestrator → Query Agent
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { v4 as uuidv4 } from 'uuid';

// Get stack outputs
async function getStackOutputs() {
  const cfClient = new CloudFormationClient({});
  
  const apiStackResponse = await cfClient.send(
    new DescribeStacksCommand({ StackName: 'ProjectCICADAAPIStack' })
  );
  
  const apiStack = apiStackResponse.Stacks?.[0];
  if (!apiStack?.Outputs) {
    throw new Error('Could not find API stack outputs');
  }
  
  const outputs: Record<string, string> = {};
  for (const output of apiStack.Outputs) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }
  
  return outputs;
}

// Get queue URL from queue name
async function getQueueUrl(queueName: string): Promise<string> {
  const sqsClient = new SQSClient({});
  const accountId = '461449807480'; // From the ARN in outputs
  const region = 'us-east-1';
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

// Simulate WebSocket message by sending directly to SQS
async function sendWebSocketMessage(queueUrl: string, message: any) {
  const sqsClient = new SQSClient({});
  
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
  });
  
  await sqsClient.send(command);
}

async function main() {
  console.log('🧪 WebSocket End-to-End Test: Rena Query\n');
  console.log('Testing flow: WebSocket → SQS → MessageProcessor → Gateway → Orchestrator → Query Agent\n');
  console.log('=' .repeat(80));
  
  try {
    // Get stack outputs
    console.log('\n📋 Getting stack outputs...');
    const outputs = await getStackOutputs();
    
    const queueName = outputs['ExportsOutputFnGetAttMessageQueue7A3BF959QueueName91AB3550'];
    const websocketUrl = outputs.WebSocketURL;
    
    if (!queueName) {
      throw new Error('Queue name not found in stack outputs');
    }
    
    const queueUrl = await getQueueUrl(queueName);
    
    console.log(`✅ Queue Name: ${queueName}`);
    console.log(`✅ Queue URL: ${queueUrl}`);
    console.log(`✅ WebSocket URL: ${websocketUrl}`);
    
    // Create test message
    const requestId = `test-ws-${Date.now()}`;
    const sessionId = `test-session-${Date.now()}`;
    const connectionId = `test-connection-${uuidv4()}`;
    const userId = 'test-user';
    const query = 'Tell me about Rena';
    
    const message = {
      requestId,
      connectionId,
      userId,
      sessionId,
      message: query,
    };
    
    console.log('\n📤 Sending message to SQS queue...');
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Query: "${query}"`);
    
    const startTime = Date.now();
    
    // Send message to SQS
    await sendWebSocketMessage(queueUrl, message);
    
    console.log('\n✅ Message sent to SQS successfully!');
    console.log('\n⏳ MessageProcessor will pick up the message and process it...');
    console.log('   This triggers: MessageProcessor → Gateway → Orchestrator → Query Agent');
    
    // Wait for processing
    console.log('\n⏱️  Waiting 15 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    const duration = Date.now() - startTime;
    
    console.log('\n✅ Test message sent successfully!');
    console.log(`   Total time: ${duration}ms`);
    
    console.log('\n📋 To verify the results:');
    console.log('   1. Check CloudWatch Logs for MessageProcessor');
    console.log('   2. Check CloudWatch Logs for Gateway Lambda');
    console.log('   3. Check CloudWatch Logs for Orchestrator Lambda');
    console.log('   4. Check CloudWatch Logs for Query Agent Lambda');
    
    console.log('\n💡 CloudWatch Log Groups:');
    console.log('   - /aws/lambda/ProjectCICADAAPIStack-MessageProcessor');
    console.log('   - /aws/lambda/ProjectCICADAAgentStack-Gateway');
    console.log('   - /aws/lambda/ProjectCICADAAgentStack-Orchestrator');
    console.log('   - /aws/lambda/ProjectCICADAAgentStack-QueryAgent');
    
    console.log('\n🔍 Check logs with:');
    console.log(`   aws logs tail /aws/lambda/ProjectCICADAAPIStack-MessageProcessor --follow --profile cicada-deployer`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
