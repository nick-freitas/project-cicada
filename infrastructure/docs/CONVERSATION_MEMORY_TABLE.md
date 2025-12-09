# ConversationMemory Table Design

## Overview

The `ConversationMemory` table stores conversation history for AgentCore agents, enabling contextual multi-turn conversations with automatic session management and cleanup.

**Requirements Addressed:**
- 11.1: Create conversation history per user/session
- 11.2: Store messages in conversation memory
- 11.3: Provide conversation history to agents
- 11.4: Compact long conversations
- 11.5: Efficient session retrieval and TTL for old sessions

## Table Schema

### Primary Keys

| Attribute | Type | Description |
|-----------|------|-------------|
| `userId` | STRING (Partition Key) | User's unique identifier from Cognito |
| `sessionKey` | STRING (Sort Key) | Composite key: `{sessionId}#{createdAt}` |

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `sessionId` | STRING | Session identifier (UUID) |
| `messages` | LIST | Array of conversation messages |
| `summary` | STRING | Compacted summary of old messages |
| `lastAccessed` | STRING (ISO 8601) | Last time session was accessed |
| `createdAt` | STRING (ISO 8601) | Session creation timestamp |
| `metadata` | MAP | Optional session metadata |
| `ttl` | NUMBER | TTL in seconds since epoch (90 days from last access) |

### Global Secondary Indexes

#### lastAccessed-index
- **Partition Key:** `userId`
- **Sort Key:** `lastAccessed`
- **Projection:** KEYS_ONLY
- **Purpose:** Efficiently query recent sessions for a user

## Access Patterns

### 1. Get Session by User and Session ID
```typescript
Query:
  KeyConditionExpression: userId = :userId AND begins_with(sessionKey, :sessionId)
  
Usage: Retrieve conversation history for a specific session
```

### 2. List Recent Sessions for User
```typescript
Query:
  KeyConditionExpression: userId = :userId
  ScanIndexForward: false
  Limit: 10
  
Usage: Show user's recent conversation sessions
```

### 3. Query Sessions by Last Accessed Time
```typescript
Query (using lastAccessed-index):
  KeyConditionExpression: userId = :userId
  ScanIndexForward: false
  
Usage: Find active sessions or sessions to archive
```

## Message Structure

Each message in the `messages` array follows this structure:

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO 8601
  metadata?: {
    agentName?: string;
    toolsInvoked?: string[];
    profileUpdates?: string[];
  };
}
```

## Session Lifecycle

### 1. Session Creation
- User starts a new conversation
- MemoryService creates a new session with empty messages array
- `createdAt` and `lastAccessed` set to current time
- TTL set to 90 days from creation

### 2. Message Addition
- User sends a message or agent responds
- Message appended to `messages` array
- `lastAccessed` updated to current time
- TTL extended to 90 days from access
- If message count exceeds threshold (50), automatic compaction triggered

### 3. Session Compaction
- Triggered when message count > 50
- Oldest messages (all except last 10) summarized into `summary` field
- Only recent 10 messages kept in `messages` array
- Reduces memory footprint while preserving context

### 4. Session Expiration
- DynamoDB automatically deletes sessions when TTL expires
- TTL is 90 days from last access
- Each access extends TTL by 90 days
- Inactive sessions are automatically cleaned up

## Capacity and Performance

### Billing Mode
- **PAY_PER_REQUEST**: No capacity planning needed, scales automatically
- Cost: $1.25 per million write requests, $0.25 per million read requests

### Expected Usage (3 users, 100 queries/month)
- **Writes:** ~200/month (messages + updates) = $0.00025
- **Reads:** ~100/month (session retrievals) = $0.000025
- **Storage:** ~1 MB = $0.00025
- **Total:** < $0.001/month

### Performance Characteristics
- **Read Latency:** < 10ms (single-digit milliseconds)
- **Write Latency:** < 10ms
- **Query Latency:** < 20ms (with GSI)
- **Consistency:** Eventually consistent reads (sufficient for conversation history)

## Data Retention

### Automatic Cleanup (TTL)
- Sessions inactive for 90 days are automatically deleted
- TTL is extended on every access
- No manual cleanup required
- Reduces storage costs

### Manual Retention
- Table has `RETAIN` removal policy
- Data persists even if CDK stack is destroyed
- Manual deletion required for complete cleanup

## Integration with AgentCore

### MemoryService Usage

```typescript
// Get conversation history
const memory = await memoryService.getSession(userId, sessionId);

// Add user message
await memoryService.addMessage(userId, sessionId, {
  role: 'user',
  content: 'Who is Rena?',
  timestamp: new Date().toISOString(),
});

// Add agent response
await memoryService.addMessage(userId, sessionId, {
  role: 'assistant',
  content: 'Rena Ryuugu is...',
  timestamp: new Date().toISOString(),
  metadata: {
    agentName: 'Query',
    toolsInvoked: ['semanticSearch'],
  },
});

// List recent sessions
const sessions = await memoryService.listSessions(userId, 10);
```

### Agent Context Passing

```typescript
// Orchestrator passes memory to specialized agents
const memory = await memoryService.getSession(userId, sessionId);

const response = await queryAgent.invoke({
  query: userQuery,
  identity: { userId, username, groups: [], attributes: {} },
  memory, // Conversation history available to agent
});
```

## Monitoring and Observability

### CloudWatch Metrics
- `ConsumedReadCapacityUnits`: Read throughput
- `ConsumedWriteCapacityUnits`: Write throughput
- `UserErrors`: Client-side errors
- `SystemErrors`: DynamoDB errors

### Logging
- All session operations logged via MemoryService
- Log fields: userId, sessionId, operation, messageCount
- Errors logged with full context

### Alarms (Recommended)
- SystemErrors > 0 for 5 minutes
- UserErrors > 10 for 5 minutes
- Throttled requests > 0

## Cost Optimization

### Current Optimizations
1. **PAY_PER_REQUEST billing**: No wasted capacity
2. **Automatic compaction**: Reduces storage and read costs
3. **TTL-based cleanup**: Automatic deletion of old sessions
4. **KEYS_ONLY projection**: Minimal GSI storage

### Future Optimizations (if needed)
1. **Provisioned capacity**: If usage becomes predictable
2. **DynamoDB Streams**: For analytics or archival
3. **Point-in-time recovery**: For data protection (adds cost)

## Security

### Access Control
- IAM policies restrict access to Lambda functions only
- No direct user access to table
- User isolation enforced at application layer (userId scoping)

### Encryption
- Encryption at rest: AWS-managed keys (default)
- Encryption in transit: TLS 1.2+
- No sensitive data stored (conversation content only)

### Data Isolation
- All queries scoped to userId
- No cross-user data access possible
- GSI queries also scoped to userId

## Backup and Recovery

### Current Strategy
- **RETAIN removal policy**: Table persists after stack deletion
- **No automatic backups**: Cost optimization
- **Manual backups**: Available via AWS Console if needed

### Disaster Recovery
- **RTO (Recovery Time Objective):** N/A (no backups)
- **RPO (Recovery Point Objective):** N/A (no backups)
- **Recommendation:** Enable point-in-time recovery if data becomes critical

## Migration Notes

### From Bedrock Agents to AgentCore
- Table structure unchanged
- MemoryService API unchanged
- Backward compatible with existing sessions
- No data migration required

### Schema Evolution
- DynamoDB is schema-less
- New attributes can be added without migration
- Old sessions will work with new code
- Use default values for missing attributes

## Testing

### Unit Tests
- MemoryService methods (create, get, add, compact, delete)
- TTL calculation
- Session compaction logic

### Integration Tests
- End-to-end session lifecycle
- Concurrent access patterns
- TTL expiration (mocked)

### Load Tests (if needed)
- 100 concurrent users
- 1000 messages/minute
- Verify no throttling

## References

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [AgentCore Memory Requirements](../.kiro/specs/agentcore-migration/requirements.md#requirement-11)
