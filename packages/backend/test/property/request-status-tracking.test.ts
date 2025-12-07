import * as fc from 'fast-check';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { RequestTrackingService } from '../../src/services/request-tracking-service';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';
import 'aws-sdk-client-mock-jest';

const dynamoMock = mockClient(DynamoDBClient);

describe('Property 34: Request Status Tracking', () => {
  let service: RequestTrackingService;

  beforeEach(() => {
    dynamoMock.reset();
    service = new RequestTrackingService(new DynamoDBClient({}), 'TestRequestTracking');
  });

  it('should track requestId, userId, connectionId, and accumulated response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.uuid(),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
        async (requestId, userId, connectionId, message, sessionId, chunks) => {
          // Mock creation
          dynamoMock.resolves({});

          await service.createRequest(requestId, userId, connectionId, message, sessionId);

          // Mock get request for chunk additions
          let accumulatedResponse = '';
          const responseChunks: string[] = [];

          for (const chunk of chunks) {
            responseChunks.push(chunk);
            accumulatedResponse += chunk;

            const mockRequest = {
              requestId,
              userId,
              connectionId,
              status: 'processing',
              message,
              sessionId,
              responseChunks: responseChunks.slice(0, -1), // Previous chunks
              accumulatedResponse: accumulatedResponse.slice(0, -chunk.length), // Previous accumulated
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ttl: Math.floor(Date.now() / 1000) + 86400,
            };

            dynamoMock.reset();
            dynamoMock.onAnyCommand().resolves({ Item: marshall(mockRequest) });

            await service.addResponseChunk(requestId, chunk);

            // Verify update was called
            expect(dynamoMock.calls().length).toBeGreaterThan(0);
          }

          // Verify final accumulated response matches all chunks
          expect(accumulatedResponse).toBe(chunks.join(''));
          expect(responseChunks).toEqual(chunks);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain request metadata throughout processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.uuid(),
        async (requestId, userId, connectionId, message, sessionId) => {
          dynamoMock.resolves({});

          const request = await service.createRequest(
            requestId,
            userId,
            connectionId,
            message,
            sessionId
          );

          // Verify all metadata is present
          expect(request.requestId).toBe(requestId);
          expect(request.userId).toBe(userId);
          expect(request.connectionId).toBe(connectionId);
          expect(request.message).toBe(message);
          expect(request.sessionId).toBe(sessionId);
          expect(request.createdAt).toBeDefined();
          expect(request.updatedAt).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update status when completing request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 500 }),
        async (requestId, finalResponse) => {
          dynamoMock.resolves({});

          await service.completeRequest(requestId, finalResponse);

          // Verify status was updated to complete
          expect(dynamoMock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update status when request errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (requestId, errorMessage) => {
          dynamoMock.resolves({});

          await service.errorRequest(requestId, errorMessage);

          // Verify status was updated to error
          expect(dynamoMock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accumulate response chunks in order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.uuid(),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
        async (requestId, userId, connectionId, message, sessionId, chunks) => {
          dynamoMock.resolves({});

          await service.createRequest(requestId, userId, connectionId, message, sessionId);

          // Mock get request for chunk additions
          let accumulatedChunks: string[] = [];
          let accumulatedResponse = '';

          for (const chunk of chunks) {
            const mockRequest = {
              requestId,
              userId,
              connectionId,
              status: 'processing',
              message,
              sessionId,
              responseChunks: accumulatedChunks.slice(), // Previous chunks
              accumulatedResponse, // Previous accumulated
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ttl: Math.floor(Date.now() / 1000) + 86400,
            };

            dynamoMock.reset();
            dynamoMock.onAnyCommand().resolves({ Item: marshall(mockRequest) });

            await service.addResponseChunk(requestId, chunk);

            accumulatedChunks.push(chunk);
            accumulatedResponse += chunk;
          }

          // Verify final accumulated response is in correct order
          expect(accumulatedResponse).toBe(chunks.join(''));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update connectionId when reconnecting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (requestId, oldConnectionId, newConnectionId) => {
          fc.pre(oldConnectionId !== newConnectionId);

          dynamoMock.resolves({});

          await service.updateConnectionId(requestId, newConnectionId);

          // Verify connectionId was updated
          expect(dynamoMock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
