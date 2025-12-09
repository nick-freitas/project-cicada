# Profile Agent

The Profile Agent is a specialized AgentCore agent responsible for managing user profiles in the CICADA system.

## Overview

The Profile Agent handles all profile-related operations with explicit operation classification and deterministic tool invocation. All operations are strictly scoped to the user's identity for data isolation.

## Features

- **Explicit Operation Classification**: Uses keyword-based classification (GET, UPDATE, LIST)
- **Direct Tool Invocation**: Deterministically invokes the appropriate tool based on operation type
- **User Isolation**: All operations are scoped to userId - users can only access their own profiles
- **Profile Types Supported**:
  - CHARACTER: Character profiles (traits, relationships, development)
  - LOCATION: Location profiles (descriptions, significance)
  - EPISODE: Episode profiles (summaries, key events)
  - FRAGMENT_GROUP: Fragment group profiles (arc information)
  - THEORY: Theory profiles (hypotheses, evidence, status)

## Architecture

```
ProfileAgent
├── classifyProfileOperation() - Keyword-based classification
├── handleGetProfile() - Retrieve specific profile
├── handleUpdateProfile() - Update existing profile
├── handleListProfiles() - List all or filtered profiles
└── Tools:
    ├── GetProfileTool - Retrieves profile from DynamoDB
    ├── UpdateProfileTool - Updates profile in DynamoDB
    └── ListProfilesTool - Lists profiles from DynamoDB
```

## Usage

### Get a Profile

```typescript
const result = await profileAgent.invokeAgent({
  query: 'Show me Rena\'s character profile',
  identity: { userId: 'user-123', username: 'nick' },
  memory: conversationMemory,
});
```

### Update a Profile

```typescript
const result = await profileAgent.invokeAgent({
  query: 'Update Rena\'s profile to add that she is suspicious',
  identity: { userId: 'user-123', username: 'nick' },
  memory: conversationMemory,
});
```

### List Profiles

```typescript
const result = await profileAgent.invokeAgent({
  query: 'Show all my character profiles',
  identity: { userId: 'user-123', username: 'nick' },
  memory: conversationMemory,
});
```

## Operation Classification

The agent uses explicit keyword matching to classify operations:

### GET Operations
Keywords: `show`, `get`, `view`, `display`, `see`, `what is`, `tell me about`, `find`, `retrieve`

Example: "Show me Rena's character profile"

### UPDATE Operations
Keywords: `update`, `save`, `edit`, `modify`, `change`, `set`, `add to`, `remove from`

Example: "Update Rena's profile to add suspicious behavior"

### LIST Operations
Keywords: `list`, `show all`, `show me all`, `all my`, `my profiles`, `what profiles`, `which profiles`

Example: "List all my character profiles"

## Tools

### GetProfileTool

Retrieves a specific profile from DynamoDB.

**Input:**
- `userId`: User ID for data isolation
- `profileType`: Profile type (CHARACTER, LOCATION, etc.)
- `profileId`: Profile identifier

**Output:**
- Profile object or null if not found

### UpdateProfileTool

Updates an existing profile in DynamoDB.

**Input:**
- `userId`: User ID for data isolation
- `profileType`: Profile type
- `profileId`: Profile identifier
- `updates`: Fields to update

**Output:**
- Updated profile object

### ListProfilesTool

Lists profiles from DynamoDB.

**Input:**
- `userId`: User ID for data isolation
- `profileType`: Optional profile type filter

**Output:**
- Array of profile objects

## Data Isolation

All profile operations enforce strict user isolation:

1. **Tool Level**: Each tool validates that `input.userId === context.userId`
2. **Service Level**: Profile service scopes all queries to userId
3. **Database Level**: DynamoDB partition key is userId

Users can NEVER access other users' profiles.

## Error Handling

The Profile Agent provides meaningful error messages:

- Profile not found: Suggests creating a new profile
- Missing information: Asks for clarification on profile type or ID
- Update failures: Explains what went wrong
- Permission errors: Enforces user isolation

## Requirements Satisfied

- **4.1**: Maintains all existing profile functionality
- **4.2**: Explicitly invokes profile service tools
- **4.3**: Persists changes to DynamoDB
- **4.4**: Provides meaningful error messages
- **4.5**: Streams responses via WebSocket (through Gateway)

## Testing

Unit tests are located in `__tests__/profile-agent.test.ts`.

Run tests:
```bash
pnpm test profile-agent
```

## Integration with Orchestrator

The Orchestrator Agent routes profile-related queries to the Profile Agent based on keyword detection:

```typescript
// In OrchestratorAgent
if (lowerQuery.includes('profile') || lowerQuery.includes('show me')) {
  return await this.profileAgent.invokeAgent(params);
}
```

## Future Enhancements

- **CREATE Operation**: Add explicit profile creation
- **DELETE Operation**: Add profile deletion
- **Advanced Extraction**: Use NER for better profile ID extraction
- **Batch Operations**: Support updating multiple profiles at once
- **Profile Templates**: Provide templates for common profile types
