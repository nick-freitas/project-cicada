import * as fc from 'fast-check';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { RequestTrackingService } from '../../src/services/request-tracking-service';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const dynamoMock = mockClient(DynamoDBClient);

describe('Property 33: Request Tracking Creation', () => {
  let service: RequestTrackingService;

  beforeEach(() => {
    dynamoMock.reset();
    service = new RequestTrackingService(new DynamoDBClient({}), 'TestRequestTracking');
  });

  it('should create a request tracking record for any user message', async () => {
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

          // Verify request was created with correct properties
          expect(request.requestId).toBe(requestId);
          expect(request.userId).toBe(userId);
          expect(request.connectionId).toBe(connectionId);
          expect(request.message).toBe(message);
          expect(request.sessionId).toBe(sessionId);
          expect(request.status).toBe('processing');
          expect(request.responseChunks).toEqual([]);
          expect(request.accumulatedResponse).toBe('');
          expect(request.createdAt).toBeGreaterThan(0);
          expect(request.updatedAt).toBeGreaterThan(0);
          expect(request.ttl).toBeGreaterThan(0);

          // Verify DynamoDB was called
          expect(dynamoMock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique requestIds for different messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            requestId: fc.uuid(),
            userId: fc.string({ minLength: 1, maxLength: 50 }),
            connectionId: fc.string({ minLength: 1, maxLength: 100 }),
            message: fc.string({ minLength: 1, maxLength: 500 }),
            sessionId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (messages) => {
          dynamoMock.resolves({});

          const requests = await Promise.all(
            messages.map((msg) =>
              service.createRequest(
                msg.requestId,
                msg.userId,
                msg.connectionId,
                msg.message,
                msg.sessionId
              )
            )
          );

          // Verify all requestIds are unique
          const requestIds = requests.map((r) => r.requestId);
          const uniqueRequestIds = new Set(requestIds);
          expect(uniqueRequestIds.size).toBe(requestIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should set TTL to 24 hours from creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.uuid(),
        async (requestId, userId, connectionId, message, sessionId) => {
          dynamoMock.resolves({});

          const beforeCreation = Math.floor(Date.now() / 1000);
          const request = await service.createRequest(
            requestId,
            userId,
            connectionId,
            message,
            sessionId
          );
          const afterCreation = Math.floor(Date.now() / 1000);

          // TTL should be approximately 24 hours (86400 seconds) from creation
          const expectedMinTTL = beforeCreation + 86400;
          const expectedMaxTTL = afterCreation + 86400;

          expect(request.ttl).toBeGreaterThanOrEqual(expectedMinTTL);
          expect(request.ttl).toBeLessThanOrEqual(expectedMaxTTL);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should initialize with empty response chunks and accumulated response', async () => {
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

          expect(request.responseChunks).toEqual([]);
          expect(request.accumulatedResponse).toBe('');
          expect(request.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should set status to processing on creation', async () => {
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

          expect(request.status).toBe('processing');
        }
      ),
      { numRuns: 100 }
    );
  });
});
