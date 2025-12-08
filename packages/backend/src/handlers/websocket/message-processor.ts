import { SQSHandler, SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { RequestTrackingService } from '../../services/request-tracking-service';
import { sendToConnection } from './handler';
import { WebSocketResponse } from '@cicada/shared-types';
import { logger } from '../../utils/logger';
import {
  invokeAgentWithRetry,
  processStreamWithErrorHandling,
  getUserFriendlyErrorMessage,
} from '../../utils/agent-invocation';
import { AgentInvocationError } from '../../types/agentcore';

const dynamoClient = new DynamoDBClient({});
const agentRuntimeClient = new BedrockAgentRuntimeClient({});
const requestTrackingService = new RequestTrackingService(dynamoClient);

const DOMAIN_NAME = process.env.WEBSOCKET_DOMAIN_NAME || '';
const STAGE = process.env.WEBSOCKET_STAGE || 'prod';
const ORCHESTRATOR_AGENT_ID = process.env.ORCHESTRATOR_AGENT_ID || '';
const ORCHESTRATOR_AGENT_ALIAS_ID = process.env.ORCHESTRATOR_AGENT_ALIAS_ID || '';

/**
 * Process messages from SQS queue and invoke Orchestrator Agent via AgentCore
 * Requirements: 7.1, 7.4, 8.1
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const startTime = Date.now();
    let requestId: string | undefined;
    let connectionId: string | undefined;

    try {
      const message = JSON.parse(record.body);
      ({ requestId, connectionId } = message);
      const { userId, message: userMessage, sessionId } = message;

      // Validate required fields
      if (!requestId || !connectionId || !userId || !userMessage || !sessionId) {
        throw new Error('Missing required fields in message');
      }

      logger.info('Processing message', {
        requestId,
        userId,
        sessionId,
        queryLength: userMessage.length,
      });

      // Validate required environment variables
      if (!ORCHESTRATOR_AGENT_ID || !ORCHESTRATOR_AGENT_ALIAS_ID) {
        throw new Error(
          'Missing required environment variables: ORCHESTRATOR_AGENT_ID or ORCHESTRATOR_AGENT_ALIAS_ID'
        );
      }

      // Invoke Orchestrator Agent via AgentCore with streaming and retry logic
      // Requirement 7.1: Use AgentCore's invocation API
      // Requirement 7.3: Implement retry logic with exponential backoff
      logger.info('Invoking Orchestrator Agent', {
        requestId,
        agentId: ORCHESTRATOR_AGENT_ID,
        agentAliasId: ORCHESTRATOR_AGENT_ALIAS_ID,
        sessionId,
      });

      const response: InvokeAgentCommandOutput = await invokeAgentWithRetry(
        agentRuntimeClient,
        {
          agentId: ORCHESTRATOR_AGENT_ID,
          agentAliasId: ORCHESTRATOR_AGENT_ALIAS_ID,
          sessionId: sessionId,
          inputText: userMessage,
          enableTrace: false, // Disable trace for production to reduce costs
        },
        'Orchestrator',
        {
          maxRetries: 3,
          retryDelay: 1000,
          timeout: 60000,
        }
      );

      // Process streaming response chunks with error handling
      // Requirement 8.1: Use AgentCore's streaming capabilities
      // Requirement 7.3: Add error handling for streaming interruptions
      if (!response.completion) {
        throw new Error('No completion stream received from agent');
      }

      const fullResponse = await processStreamWithErrorHandling(
        response.completion,
        async (chunkText: string) => {
          // Store chunk for reconnection support
          await requestTrackingService.addResponseChunk(requestId, chunkText);

          // Send chunk to WebSocket connection
          // Requirement 8.1: Send streaming chunks to WebSocket
          const chunkResponse: WebSocketResponse = {
            requestId,
            type: 'chunk',
            content: chunkText,
          };

          await sendToConnection(DOMAIN_NAME, STAGE, connectionId, chunkResponse);
        },
        async (error: Error) => {
          // Handle streaming errors
          logger.error('Streaming error', {
            requestId,
            error: error.message,
          });

          // Send error to client
          const errorResponse: WebSocketResponse = {
            requestId,
            type: 'error',
            error: getUserFriendlyErrorMessage(error, 'Orchestrator'),
          };

          await sendToConnection(DOMAIN_NAME, STAGE, connectionId, errorResponse);
        }
      );

      // Send completion marker
      // Requirement 8.1: Send completion marker when stream completes
      const completeResponse: WebSocketResponse = {
        requestId,
        type: 'complete',
      };

      await sendToConnection(DOMAIN_NAME, STAGE, connectionId, completeResponse);

      // Mark request as complete
      await requestTrackingService.completeRequest(requestId, fullResponse);

      const duration = Date.now() - startTime;
      logger.info('Message processing complete', {
        requestId,
        duration,
        responseLength: fullResponse.length,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Requirement 7.3: Add comprehensive error logging
      // Property 6: Error Recovery - provide meaningful error message without exposing internal details
      logger.error('Error processing message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof AgentInvocationError ? 'AgentInvocationError' : error?.constructor?.name,
        retryable: error instanceof AgentInvocationError ? error.retryable : false,
        agentName: error instanceof AgentInvocationError ? error.agentName : undefined,
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

          // Requirement 8.1: Send error marker when stream encounters error
          // Property 6: Error Recovery - provide meaningful error message without exposing internal details
          const userFriendlyMessage = error instanceof AgentInvocationError
            ? getUserFriendlyErrorMessage(error.originalError || error, error.agentName)
            : getUserFriendlyErrorMessage(error, 'System');

          const errorResponse: WebSocketResponse = {
            requestId,
            type: 'error',
            error: userFriendlyMessage,
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
