import { SQSHandler, SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { RequestTrackingService } from '../../services/request-tracking-service';
import { sendToConnection } from './handler';
import { WebSocketResponse } from '@cicada/shared-types';
import { logger } from '../../utils/logger';

const dynamoClient = new DynamoDBClient({});
const lambdaClient = new LambdaClient({});
const requestTrackingService = new RequestTrackingService(dynamoClient);

const DOMAIN_NAME = process.env.WEBSOCKET_DOMAIN_NAME || '';
const STAGE = process.env.WEBSOCKET_STAGE || 'prod';
const GATEWAY_FUNCTION_ARN = process.env.GATEWAY_FUNCTION_ARN || '';

/**
 * Process messages from SQS queue and invoke Gateway Lambda
 * 
 * This handler replaces the custom RAG logic with Gateway invocation.
 * The Gateway handles:
 * - Identity extraction and validation
 * - Policy enforcement
 * - Memory management
 * - Agent orchestration
 * - Streaming responses
 * 
 * Requirements: 8.1, 8.2, 12.1, 12.2, 16.1
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const startTime = Date.now();
    let requestId: string | undefined;
    let connectionId: string | undefined;

    try {
      const message = JSON.parse(record.body);
      requestId = message.requestId;
      connectionId = message.connectionId;
      const { userId, message: userMessage, sessionId } = message;

      // Validate required fields
      if (!requestId || !connectionId || !userId || !userMessage || !sessionId) {
        throw new Error('Missing required fields in message');
      }

      // Type assertions after validation
      const validRequestId: string = requestId;
      const validConnectionId: string = connectionId;

      logger.info('Processing message via Gateway', {
        requestId,
        userId,
        sessionId,
        queryLength: userMessage.length,
      });

      // Validate Gateway function ARN is configured
      if (!GATEWAY_FUNCTION_ARN) {
        throw new Error('GATEWAY_FUNCTION_ARN environment variable not set');
      }

      // Invoke Gateway Lambda with streaming callback
      // Requirement 8.1: Pass userId, sessionId, connectionId to Gateway
      // Requirement 8.2: Handle streaming responses from Gateway
      const gatewayRequest = {
        query: userMessage,
        userId,
        sessionId,
        connectionId: validConnectionId,
        requestId: validRequestId,
      };

      logger.info('Invoking Gateway Lambda', {
        requestId,
        functionArn: GATEWAY_FUNCTION_ARN,
      });

      // Invoke Gateway Lambda
      const invokeCommand = new InvokeCommand({
        FunctionName: GATEWAY_FUNCTION_ARN,
        InvocationType: 'RequestResponse', // Synchronous invocation
        Payload: JSON.stringify({
          body: JSON.stringify(gatewayRequest),
          requestContext: {
            requestId: validRequestId,
          },
        }),
      });

      const lambdaResponse = await lambdaClient.send(invokeCommand);

      // Parse Lambda response
      if (!lambdaResponse.Payload) {
        throw new Error('No payload received from Gateway Lambda');
      }

      const payloadString = new TextDecoder().decode(lambdaResponse.Payload);
      const gatewayResponse = JSON.parse(payloadString);

      logger.info('Gateway Lambda response received', {
        requestId,
        statusCode: gatewayResponse.statusCode,
      });

      // Check for Lambda execution errors
      if (lambdaResponse.FunctionError) {
        throw new Error(`Gateway Lambda error: ${lambdaResponse.FunctionError}`);
      }

      // Parse response body
      const responseBody = JSON.parse(gatewayResponse.body || '{}');

      // Handle Gateway errors
      if (gatewayResponse.statusCode !== 200 || !responseBody.content) {
        const errorMessage = responseBody.error || 'Gateway returned an error';
        throw new Error(errorMessage);
      }

      // Stream the response to WebSocket
      // Requirement 12.2: Maintain backward compatibility with WebSocketResponse format
      const fullResponse = responseBody.content;

      // Simulate streaming by chunking the response
      // This maintains the same streaming behavior as before
      const chunkSize = 50; // Characters per chunk
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        const chunk = fullResponse.substring(i, i + chunkSize);

        // Store chunk for reconnection support
        await requestTrackingService.addResponseChunk(validRequestId, chunk);

        // Send chunk to WebSocket connection
        const chunkResponse: WebSocketResponse = {
          requestId: validRequestId,
          type: 'chunk',
          content: chunk,
        };

        await sendToConnection(DOMAIN_NAME, STAGE, validConnectionId, chunkResponse);

        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Send completion marker
      // Requirement 8.1: Send completion marker when stream completes
      const completeResponse: WebSocketResponse = {
        requestId: validRequestId,
        type: 'complete',
      };

      await sendToConnection(DOMAIN_NAME, STAGE, validConnectionId, completeResponse);

      // Mark request as complete
      await requestTrackingService.completeRequest(validRequestId, fullResponse);

      const duration = Date.now() - startTime;
      logger.info('Message processing complete', {
        requestId,
        duration,
        responseLength: fullResponse.length,
        metadata: responseBody.metadata,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Error processing message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error?.constructor?.name,
        stack: error instanceof Error ? error.stack : undefined,
        requestId,
        duration,
      });

      // Try to send error to client
      if (requestId && connectionId) {
        try {
          await requestTrackingService.errorRequest(
            requestId,
            error instanceof Error ? error.message : 'Unknown error'
          );

          const errorResponse: WebSocketResponse = {
            requestId,
            type: 'error',
            error: 'Sorry, I encountered an error processing your request. Please try again.',
          };

          await sendToConnection(DOMAIN_NAME, STAGE, connectionId, errorResponse);
        } catch (sendError) {
          logger.error('Failed to send error to client', {
            error: sendError instanceof Error ? sendError.message : 'Unknown error',
            requestId,
          });
        }
      }
    }
  }
};
