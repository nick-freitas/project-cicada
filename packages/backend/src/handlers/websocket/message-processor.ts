import { SQSHandler, SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { RequestTrackingService } from '../../services/request-tracking-service';
import { sendToConnection } from './handler';
import { WebSocketResponse } from '@cicada/shared-types';
import { logger } from '../../utils/logger';
import { semanticSearch } from '../../services/knowledge-base-service';

const dynamoClient = new DynamoDBClient({});
const bedrockClient = new BedrockRuntimeClient({});
const agentRuntimeClient = new BedrockAgentRuntimeClient({});
const requestTrackingService = new RequestTrackingService(dynamoClient);

const DOMAIN_NAME = process.env.WEBSOCKET_DOMAIN_NAME || '';
const STAGE = process.env.WEBSOCKET_STAGE || 'prod';
const MODEL_ID = 'amazon.nova-pro-v1:0';
const PROFILE_AGENT_ID = process.env.PROFILE_AGENT_ID || '';
const PROFILE_AGENT_ALIAS_ID = process.env.PROFILE_AGENT_ALIAS_ID || '';
const THEORY_AGENT_ID = process.env.THEORY_AGENT_ID || '';
const THEORY_AGENT_ALIAS_ID = process.env.THEORY_AGENT_ALIAS_ID || '';

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

      logger.info('Processing message with custom RAG', {
        requestId,
        userId,
        sessionId,
        queryLength: userMessage.length,
      });

      // Step 1: Perform semantic search over script data
      logger.info('Performing semantic search', { requestId, query: userMessage.substring(0, 50) });
      
      const searchResults = await semanticSearch(userMessage, {
        topK: 20,
        minScore: 0.5,
        maxEmbeddingsToLoad: 3000,
      });

      logger.info('Search completed', {
        requestId,
        resultCount: searchResults.length,
        topScore: searchResults[0]?.score,
      });

      // Step 2: Format search results as context
      let contextText = '';
      if (searchResults.length > 0) {
        contextText = 'Here are relevant passages from the Higurashi script:\n\n';
        searchResults.slice(0, 10).forEach((result, idx) => {
          contextText += `[${idx + 1}] Episode: ${result.episodeName}, Chapter: ${result.chapterId}, Message: ${result.messageId}\n`;
          if (result.speaker) {
            contextText += `Speaker: ${result.speaker}\n`;
          }
          contextText += `Text: ${result.textENG}\n`;
          contextText += `Relevance: ${(result.score * 100).toFixed(1)}%\n\n`;
        });
      } else {
        contextText = 'No relevant passages found in the script for this query.\n\n';
      }

      // Step 3: Build prompt with context
      const systemPrompt = `You are CICADA, an AI assistant for analyzing "Higurashi no Naku Koro Ni". 

You have access to the complete script database through semantic search. When answering questions:
1. Base your response STRICTLY on the provided script passages
2. Cite specific episodes, chapters, and speakers
3. If no relevant passages are found, say so honestly
4. Never make up information not present in the passages
5. Maintain episode boundaries - don't mix information from different story arcs

Be conversational but accurate. Always ground your responses in the script evidence provided.`;

      const userPrompt = `${contextText}User question: ${userMessage}

Based on the script passages above, please answer the user's question. Cite specific episodes and chapters in your response.`;

      // Step 4: Call Bedrock model with streaming
      logger.info('Invoking Bedrock model', { requestId, model: MODEL_ID });

      const command = new ConverseStreamCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.7,
          topP: 0.9,
        },
      });

      const response = await bedrockClient.send(command);

      if (!response.stream) {
        throw new Error('No stream received from Bedrock');
      }

      // Step 5: Process streaming response
      let fullResponse = '';
      
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta?.text) {
          const chunkText = event.contentBlockDelta.delta.text;
          fullResponse += chunkText;

          // Store chunk for reconnection support
          await requestTrackingService.addResponseChunk(validRequestId, chunkText);

          // Send chunk to WebSocket connection
          const chunkResponse: WebSocketResponse = {
            requestId: validRequestId,
            type: 'chunk',
            content: chunkText,
          };

          await sendToConnection(DOMAIN_NAME, STAGE, validConnectionId, chunkResponse);
        }

        if (event.messageStop) {
          logger.info('Stream completed', {
            requestId,
            responseLength: fullResponse.length,
          });
        }
      }

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
