/**
 * Test MessageProcessor Lambda directly with Rena query
 * 
 * This simulates the SQS message that would be sent by WebSocketHandler
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudWatchLogsClient, GetLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { v4 as uuidv4 } from 'uuid';

async function getMessageProcessorFunctionName(): Promise<string> {
  const lambdaClient = new LambdaClient({});
  
  // List functions and find MessageProcessor
  const { Functions } = await lambdaClient.send(
    new (await import('@aws-sdk/client-lambda')).ListFunctionsCommand({})
  );
  
  const messageProcessor = Functions?.find(f => 
    f.FunctionName?.includes('MessageProcessor')
  );
  
  if (!messageProcessor?.FunctionName) {
    throw new Error('MessageProcessor function not found');
  }
  
  return messageProcessor.FunctionName;
}

async function invokeMessageProcessor(functionName: string, message: any) {
  const lambdaClient = new LambdaClient({});
  
  // Create SQS event format
  const sqsEvent = {
    Records: [
      {
        messageId: uuidv4(),
        receiptHandle: 'test-receipt-handle',
        body: JSON.stringify(message),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: Date.now().toString(),
          SenderId: 'test-sender',
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: 'test-md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:461449807480:test-queue',
        awsRegion: 'us-east-1',
      },
    ],
  };
  
  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(sqsEvent),
  });
  
  return await lambdaClient.send(command);
}

async function main() {
  console.log('🧪 MessageProcessor Test: Rena Query\n');
  console.log('Testing flow: MessageProcessor → Gateway → Orchestrator → Query Agent\n');
  console.log('=' .repeat(80));
  
  try {
    // Get function name
    console.log('\n📋 Getting MessageProcessor function name...');
    const functionName = await getMessageProcessorFunctionName();
    console.log(`✅ Function: ${functionName}`);
    
    // Create test message
    const requestId = `test-mp-${Date.now()}`;
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
    
    console.log('\n📤 Invoking MessageProcessor Lambda...');
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Query: "${query}"`);
    console.log(`   Connection ID: ${connectionId}`);
    
    const startTime = Date.now();
    
    // Invoke MessageProcessor
    const response = await invokeMessageProcessor(functionName, message);
    
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ MessageProcessor invoked in ${duration}ms`);
    
    // Parse response
    if (response.Payload) {
      const payloadString = new TextDecoder().decode(response.Payload);
      const result = JSON.parse(payloadString);
      
      console.log('\n📄 Response:');
      console.log(JSON.stringify(result, null, 2));
    }
    
    // Check for errors
    if (response.FunctionError) {
      console.log(`\n⚠️  Function Error: ${response.FunctionError}`);
    }
    
    console.log('\n📋 What happened:');
    console.log('   1. MessageProcessor received the SQS message');
    console.log('   2. MessageProcessor invoked Gateway Lambda');
    console.log('   3. Gateway invoked Orchestrator Lambda');
    console.log('   4. Orchestrator routed to Query Agent');
    console.log('   5. Query Agent attempted to search the script');
    console.log('   6. Response streamed back (simulated - no real WebSocket)');
    
    console.log('\n💡 Check CloudWatch Logs for details:');
    console.log(`   aws logs tail /aws/lambda/${functionName} --follow --profile cicada-deployer`);
    console.log('   aws logs tail /aws/lambda/ProjectCICADAAgentStack-Gateway --follow --profile cicada-deployer');
    console.log('   aws logs tail /aws/lambda/ProjectCICADAAgentStack-Orchestrator --follow --profile cicada-deployer');
    console.log('   aws logs tail /aws/lambda/ProjectCICADAAgentStack-QueryAgent --follow --profile cicada-deployer');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
