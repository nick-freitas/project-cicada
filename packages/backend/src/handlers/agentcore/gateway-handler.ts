/**
 * Gateway Lambda Handler
 * 
 * Entry point Lambda function for all AgentCore requests.
 * Handles routing, session management, identity extraction, policy enforcement,
 * and WebSocket streaming.
 * 
 * Requirements: 1.3, 1.4, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { gateway, GatewayRequest } from '../../services/agentcore/gateway';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lambda handler for Gateway
 * 
 * This handler:
 * 1. Extracts request parameters from API Gateway event
 * 2. Invokes the Gateway service
 * 3. Returns response in API Gateway format
 * 
 * Environment Variables:
 * - ORCHESTRATOR_FUNCTION_ARN: ARN of Orchestrator Lambda
 * - QUERY_FUNCTION_ARN: ARN of Query Agent Lambda
 * - THEORY_FUNCTION_ARN: ARN of Theory Agent Lambda
 * - PROFILE_FUNCTION_ARN: ARN of Profile Agent Lambda
 * - USER_PROFILES_TABLE: DynamoDB table for user profiles
 * - CONVERSATION_MEMORY_TABLE: DynamoDB table for conversation memory
 * - KNOWLEDGE_BASE_BUCKET: S3 bucket for knowledge base
 * - MODEL_ID: Bedrock model ID (default: amazon.nova-pro-v1:0)
 * 
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId || uuidv4();

  logger.info('Gateway handler invoked', {
    requestId,
    httpMethod: event.httpMethod,
    path: event.path,
  });

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Extract parameters
    const query = body.query;
    const userId = body.userId || event.requestContext.authorizer?.claims?.sub;
    const sessionId = body.sessionId || uuidv4();
    const connectionId = body.connectionId || event.requestContext.connectionId;
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    const agentName = body.agentName;

    // Validate required parameters
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required parameter: query',
        }),
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required parameter: userId',
        }),
      };
    }

    // Create Gateway request
    const gatewayRequest: GatewayRequest = {
      query,
      userId,
      sessionId,
      connectionId: connectionId || 'http',
      requestId,
      token,
      agentName,
    };

    // Handle request with retry logic
    const response = await gateway.handleRequestWithRetry(gatewayRequest);

    // Return response
    if (response.success) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          requestId: response.requestId,
          content: response.content,
          metadata: response.metadata,
        }),
      };
    } else {
      return {
        statusCode: 500,
        body: JSON.stringify({
          requestId: response.requestId,
          error: response.error,
        }),
      };
    }
  } catch (error) {
    logger.error('Gateway handler error', error, { requestId });

    return {
      statusCode: 500,
      body: JSON.stringify({
        requestId,
        error: 'Internal server error',
      }),
    };
  }
};
