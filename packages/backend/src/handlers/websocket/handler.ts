import {
  APIGatewayProxyWebsocketHandlerV2,
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { WebSocketMessage, WebSocketResponse } from '@cicada/shared-types';
import { RequestTrackingService } from '../../services/request-tracking-service';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});
const requestTrackingService = new RequestTrackingService(dynamoClient);

const QUEUE_URL = process.env.MESSAGE_QUEUE_URL || '';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'WebSocketConnections';

// Store active connections in DynamoDB
const connectionStore = {
  async add(connectionId: string, userId: string): Promise<void> {
    const { PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall } = await import('@aws-sdk/util-dynamodb');
    
    await dynamoClient.send(
      new PutItemCommand({
        TableName: CONNECTIONS_TABLE,
        Item: marshall({
          connectionId,
          userId,
          connectedAt: Date.now(),
        }),
      })
    );
  },

  async remove(connectionId: string): Promise<void> {
    const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall } = await import('@aws-sdk/util-dynamodb');
    
    await dynamoClient.send(
      new DeleteItemCommand({
        TableName: CONNECTIONS_TABLE,
        Key: marshall({ connectionId }),
      })
    );
  },

  async get(connectionId: string): Promise<{ userId: string } | null> {
    const { GetItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall, unmarshall } = await import('@aws-sdk/util-dynamodb');
    
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: CONNECTIONS_TABLE,
        Key: marshall({ connectionId }),
      })
    );

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as { userId: string };
  },
};

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  const { requestContext } = event;
  const { routeKey, connectionId } = requestContext;

  console.log('WebSocket event:', { routeKey, connectionId });

  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(event);
      case '$disconnect':
        return await handleDisconnect(event);
      case 'sendMessage':
        return await handleSendMessage(event);
      case 'resume':
        return await handleResume(event);
      default:
        return { statusCode: 400, body: 'Unknown route' };
    }
  } catch (error) {
    console.error('WebSocket handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleConnect(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const { connectionId } = event.requestContext;
  
  // Extract userId from query parameters or connection context
  // In production, this would come from the authorizer after authentication
  const userId = 'anonymous'; // TODO: Extract from authorizer after Cognito integration

  await connectionStore.add(connectionId, userId);

  console.log('Connection established:', { connectionId, userId });

  return { statusCode: 200, body: 'Connected' };
}

async function handleDisconnect(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const { connectionId } = event.requestContext;

  await connectionStore.remove(connectionId);

  console.log('Connection closed:', { connectionId });

  return { statusCode: 200, body: 'Disconnected' };
}

async function handleSendMessage(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const { connectionId } = event.requestContext;
  
  if (!event.body) {
    return { statusCode: 400, body: 'Missing message body' };
  }

  const message: WebSocketMessage = JSON.parse(event.body);
  
  if (!message.message) {
    return { statusCode: 400, body: 'Missing message content' };
  }

  // Get user info from connection
  const connection = await connectionStore.get(connectionId);
  if (!connection) {
    return { statusCode: 403, body: 'Connection not found' };
  }

  // Generate requestId if not provided
  const requestId = message.requestId || uuidv4();
  const sessionId = message.requestId || uuidv4(); // Use requestId as sessionId for simplicity

  // Create request tracking record
  await requestTrackingService.createRequest(
    requestId,
    connection.userId,
    connectionId,
    message.message,
    sessionId
  );

  // Send message to SQS for async processing
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify({
        requestId,
        userId: connection.userId,
        connectionId,
        message: message.message,
        sessionId,
      }),
    })
  );

  console.log('Message queued:', { requestId, userId: connection.userId });

  return { statusCode: 200, body: JSON.stringify({ requestId }) };
}

async function handleResume(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const { connectionId } = event.requestContext;
  
  if (!event.body) {
    return { statusCode: 400, body: 'Missing message body' };
  }

  const message: WebSocketMessage = JSON.parse(event.body);
  
  if (!message.requestId) {
    return { statusCode: 400, body: 'Missing requestId' };
  }

  // Get request tracking record
  const request = await requestTrackingService.getRequest(message.requestId);
  
  if (!request) {
    return { statusCode: 404, body: 'Request not found' };
  }

  // Verify user owns this request
  const connection = await connectionStore.get(connectionId);
  if (!connection || connection.userId !== request.userId) {
    return { statusCode: 403, body: 'Unauthorized' };
  }

  // Update connection ID for this request
  await requestTrackingService.updateConnectionId(message.requestId, connectionId);

  // Send accumulated response chunks to new connection
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  try {
    // Send all accumulated chunks
    for (const chunk of request.responseChunks) {
      const response: WebSocketResponse = {
        requestId: message.requestId,
        type: 'chunk',
        content: chunk,
      };

      await apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(response)),
        })
      );
    }

    // If request is complete, send completion message
    if (request.status === 'complete') {
      const response: WebSocketResponse = {
        requestId: message.requestId,
        type: 'complete',
        content: request.accumulatedResponse,
      };

      await apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(response)),
        })
      );
    } else if (request.status === 'error') {
      const response: WebSocketResponse = {
        requestId: message.requestId,
        type: 'error',
        error: request.error,
      };

      await apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(response)),
        })
      );
    }

    console.log('Resume successful:', { requestId: message.requestId, connectionId });

    return { statusCode: 200, body: 'Resumed' };
  } catch (error) {
    if (error instanceof GoneException) {
      console.log('Connection gone during resume:', { connectionId });
      return { statusCode: 410, body: 'Connection gone' };
    }
    throw error;
  }
}

// Helper function to send response to WebSocket connection
export async function sendToConnection(
  domainName: string,
  stage: string,
  connectionId: string,
  response: WebSocketResponse
): Promise<void> {
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    await apiGatewayClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(response)),
      })
    );
  } catch (error) {
    if (error instanceof GoneException) {
      console.log('Connection gone:', { connectionId });
      // Connection is closed, remove from store
      await connectionStore.remove(connectionId);
    } else {
      throw error;
    }
  }
}
