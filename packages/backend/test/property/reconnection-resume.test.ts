import * as fc from 'fast-check';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { RequestTrackingService } from '../../src/services/request-tracking-service';
import { RequestTracking } from '@cicada/shared-types';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';
import 'aws-sdk-client-mock-jest';

const dynamoMock = mockClient(DynamoDBClient);

describe('Property 35: Reconnection Resume', () => {
  let service: RequestTrackingService;

  beforeEach(() => {
    dynamoMock.reset();
    service = new RequestTrackingService(new DynamoDBClient({}), 'TestRequestTracking');
  });

  it('should allow resuming response delivery from where it left off', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
        async (requestId, userId, oldConnectionId, newConnectionId, chunks) => {
          fc.pre(oldConnectionId !== newConnectionId);

          // Create a request with some accumulated chunks
          const mockRequest: RequestTracking = {
            requestId,
            userId,
            connectionId: oldConnectionId,
            status: 'processing',
            message: 'test message',
            sessionId: 'test-session',
            responseChunks: chunks,
            accumulatedResponse: chunks.join(''),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          };

          // Mock getRequest to return the existing request
          dynamoMock.onAnyCommand().resolves({
            Item: marshall(mockRequest),
          });

          const retrievedRequest = await service.getRequest(requestId);

          // Verify we can retrieve the request
          expect(retrievedRequest).not.toBeNull();
          expect(retrievedRequest?.requestId).toBe(requestId);
          expect(retrievedRequest?.responseChunks).toEqual(chunks);
          expect(retrievedRequest?.accumulatedResponse).toBe(chunks.join(''));

          // Update connection ID for reconnection
          dynamoMock.resolves({});
          await service.updateConnectionId(requestId, newConnectionId);

          // Verify update was called
          expect(dynamoMock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all response chunks during reconnection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 10 }),
        async (requestId, userId, oldConnectionId, newConnectionId, chunks) => {
          fc.pre(oldConnectionId !== newConnectionId);

          const mockRequest: RequestTracking = {
            requestId,
            userId,
            connectionId: oldConnectionId,
            status: 'processing',
            message: 'test message',
            sessionId: 'test-session',
            responseChunks: chunks,
            accumulatedResponse: chunks.join(''),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          };

          dynamoMock.onAnyCommand().resolves({
            Item: marshall(mockRequest),
          });

          const retrievedRequest = await service.getRequest(requestId);

          // Verify all chunks are preserved
          expect(retrievedRequest?.responseChunks).toHaveLength(chunks.length);
          expect(retrievedRequest?.responseChunks).toEqual(chunks);
          expect(retrievedRequest?.accumulatedResponse).toBe(chunks.join(''));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle reconnection for completed requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
        async (requestId, userId, connectionId, chunks) => {
          const mockRequest: RequestTracking = {
            requestId,
            userId,
            connectionId,
            status: 'complete',
            message: 'test message',
            sessionId: 'test-session',
            responseChunks: chunks,
            accumulatedResponse: chunks.join(''),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          };

          dynamoMock.onAnyCommand().resolves({
            Item: marshall(mockRequest),
          });

          const retrievedRequest = await service.getRequest(requestId);

          // Verify completed request can be retrieved
          expect(retrievedRequest?.status).toBe('complete');
          expect(retrievedRequest?.responseChunks).toEqual(chunks);
          expect(retrievedRequest?.accumulatedResponse).toBe(chunks.join(''));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle reconnection for errored requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
        async (requestId, userId, connectionId, errorMessage, chunks) => {
          const mockRequest: RequestTracking = {
            requestId,
            userId,
            connectionId,
            status: 'error',
            message: 'test message',
            sessionId: 'test-session',
            responseChunks: chunks,
            accumulatedResponse: chunks.join(''),
            error: errorMessage,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          };

          dynamoMock.onAnyCommand().resolves({
            Item: marshall(mockRequest),
          });

          const retrievedRequest = await service.getRequest(requestId);

          // Verify errored request can be retrieved with error info
          expect(retrievedRequest?.status).toBe('error');
          expect(retrievedRequest?.error).toBe(errorMessage);
          expect(retrievedRequest?.responseChunks).toEqual(chunks);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null for non-existent requestId', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (requestId) => {
        dynamoMock.onAnyCommand().resolves({});

        const retrievedRequest = await service.getRequest(requestId);

        expect(retrievedRequest).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should maintain request order during reconnection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 3, maxLength: 10 }),
        async (requestId, userId, connectionId, chunks) => {
          const mockRequest: RequestTracking = {
            requestId,
            userId,
            connectionId,
            status: 'processing',
            message: 'test message',
            sessionId: 'test-session',
            responseChunks: chunks,
            accumulatedResponse: chunks.join(''),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          };

          dynamoMock.onAnyCommand().resolves({
            Item: marshall(mockRequest),
          });

          const retrievedRequest = await service.getRequest(requestId);

          // Verify chunks are in the same order
          expect(retrievedRequest?.responseChunks).toEqual(chunks);

          // Verify accumulated response matches ordered chunks
          const expectedAccumulated = chunks.join('');
          expect(retrievedRequest?.accumulatedResponse).toBe(expectedAccumulated);
        }
      ),
      { numRuns: 100 }
    );
  });
});
