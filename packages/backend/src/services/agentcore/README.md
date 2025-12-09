# AgentCore Services

Core services for the AgentCore framework that provide identity management, access control, and conversation memory.

## Services

### Identity Service

Manages user authentication and identity for multi-user support.

**Features:**
- JWT token verification with AWS Cognito
- User identity extraction and validation
- WebSocket connection authentication
- Identity propagation to all agents

**Usage:**
```typescript
import { identityService } from './services/agentcore';

// Get identity from userId
const identity = await identityService.getUserIdentity('user-123');

// Get identity from JWT token
const identity = await identityService.getUserIdentityFromToken(token);

// Validate identity
const isValid = await identityService.validateIdentity(identity);

// Get identity from WebSocket context
const identity = await identityService.getUserIdentityFromWebSocket(context);
```

**Requirements:** 9.1, 9.2

### Policy Service (To Be Implemented)

Will manage access control, rate limiting, and data isolation.

**Requirements:** 10.1, 10.2, 10.3, 10.4

### Memory Service (To Be Implemented)

Will manage conversation history and session state.

**Requirements:** 11.1, 11.2, 11.3, 11.4

## Architecture

```
User Request
    │
    ▼
Gateway
    │
    ├─► Identity Service (extract & validate user)
    ├─► Policy Service (enforce access control)
    └─► Memory Service (load conversation history)
    │
    ▼
Orchestrator Agent (with identity & memory context)
    │
    └─► Specialized Agents (identity propagated)
```

## Environment Variables

- `USER_POOL_ID`: AWS Cognito User Pool ID
- `USER_POOL_CLIENT_ID`: AWS Cognito User Pool Client ID

## Testing

Unit tests are co-located with source files in `__tests__/` directories.

```bash
pnpm test services/agentcore
```
