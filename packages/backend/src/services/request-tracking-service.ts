import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { RequestTracking } from '@cicada/shared-types';

export class RequestTrackingService {
  private readonly tableName: string;

  constructor(
    private readonly dynamoClient: DynamoDBClient,
    tableName?: string
  ) {
    this.tableName = tableName || process.env.REQUEST_TRACKING_TABLE || 'RequestTracking';
  }

  async createRequest(
    requestId: string,
    userId: string,
    connectionId: string,
    message: string,
    sessionId: string
  ): Promise<RequestTracking> {
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + 86400; // 24 hours from now

    const request: RequestTracking = {
      requestId,
      userId,
      connectionId,
      status: 'processing',
      message,
      sessionId,
      responseChunks: [],
      accumulatedResponse: '',
      createdAt: now,
      updatedAt: now,
      ttl,
    };

    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(request),
      })
    );

    return request;
  }

  async getRequest(requestId: string): Promise<RequestTracking | null> {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ requestId }),
      })
    );

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as RequestTracking;
  }

  async addResponseChunk(requestId: string, chunk: string): Promise<void> {
    const request = await this.getRequest(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    const updatedChunks = [...request.responseChunks, chunk];
    const updatedResponse = request.accumulatedResponse + chunk;

    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ requestId }),
        UpdateExpression: 'SET responseChunks = :chunks, accumulatedResponse = :response, updatedAt = :updatedAt',
        ExpressionAttributeValues: marshall({
          ':chunks': updatedChunks,
          ':response': updatedResponse,
          ':updatedAt': Date.now(),
        }),
      })
    );
  }

  async completeRequest(requestId: string, finalResponse?: string): Promise<void> {
    const updateExpression = finalResponse
      ? 'SET #status = :status, accumulatedResponse = :response, updatedAt = :updatedAt'
      : 'SET #status = :status, updatedAt = :updatedAt';

    const expressionAttributeValues: Record<string, any> = {
      ':status': 'complete',
      ':updatedAt': Date.now(),
    };

    if (finalResponse) {
      expressionAttributeValues[':response'] = finalResponse;
    }

    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ requestId }),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall(expressionAttributeValues),
      })
    );
  }

  async errorRequest(requestId: string, error: string): Promise<void> {
    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ requestId }),
        UpdateExpression: 'SET #status = :status, #error = :error, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#error': 'error',
        },
        ExpressionAttributeValues: marshall({
          ':status': 'error',
          ':error': error,
          ':updatedAt': Date.now(),
        }),
      })
    );
  }

  async updateConnectionId(requestId: string, newConnectionId: string): Promise<void> {
    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ requestId }),
        UpdateExpression: 'SET connectionId = :connectionId, updatedAt = :updatedAt',
        ExpressionAttributeValues: marshall({
          ':connectionId': newConnectionId,
          ':updatedAt': Date.now(),
        }),
      })
    );
  }
}
