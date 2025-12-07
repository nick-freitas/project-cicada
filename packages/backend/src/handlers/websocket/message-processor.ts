import { SQSHandler, SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { RequestTrackingService } from '../../services/request-tracking-service';
import { OrchestratorAgent } from '../../agents/orchestrator-agent';
import { sendToConnection } from './handler';
import { WebSocketResponse } from '@cicada/shared-types';

const dynamoClient = new DynamoDBClient({});
const bedrockClient = new BedrockRuntimeClient({});
const requestTrackingService = new RequestTrackingService(dynamoClient);
const orchestratorAgent = new OrchestratorAgent(bedrockClient);

const DOMAIN_NAME = process.env.WEBSOCKET_DOMAIN_NAME || '';
const STAGE = process.env.WEBSOCKET_STAGE || 'prod';

export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const { requestId, userId, connectionId, message: userMessage, sessionId } = message;

      console.log('Processing message:', { requestId, userId });

      // Process the query through the orchestrator
      const result = await orchestratorAgent.processQuery({
        userId,
        query: userMessage,
        sessionId,
      });

      // For now, send the complete response as a single chunk
      // TODO: Implement true streaming in future iteration
      const responseContent = result.content;

      // Store response in request tracking
      await requestTrackingService.addResponseChunk(requestId, responseContent);

      // Send response to WebSocket connection
      const response: WebSocketResponse = {
        requestId,
        type: 'chunk',
        content: responseContent,
      };

      await sendToConnection(DOMAIN_NAME, STAGE, connectionId, response);

      // Mark request as complete
      await requestTrackingService.completeRequest(requestId, responseContent);

      // Send completion message
      const completeResponse: WebSocketResponse = {
        requestId,
        type: 'complete',
      };

      await sendToConnection(DOMAIN_NAME, STAGE, connectionId, completeResponse);

      console.log('Message processing complete:', { requestId });
    } catch (error) {
      console.error('Error processing message:', error);

      // Try to send error to client
      try {
        const message = JSON.parse(record.body);
        const { requestId, connectionId } = message;

        await requestTrackingService.errorRequest(
          requestId,
          error instanceof Error ? error.message : 'Unknown error'
        );

        const errorResponse: WebSocketResponse = {
          requestId,
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        await sendToConnection(DOMAIN_NAME, STAGE, connectionId, errorResponse);
      } catch (sendError) {
        console.error('Failed to send error to client:', sendError);
      }
    }
  }
};
