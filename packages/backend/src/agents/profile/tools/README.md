# Profile Service Tools

This directory contains AgentCore tools for managing user profiles in CICADA. These tools provide CRUD operations for Character, Location, Episode, Fragment Group, and Theory profiles.

## Tools

### GetProfileTool

Retrieves a specific profile by type and ID.

**Input:**
```typescript
{
  profileType: 'CHARACTER' | 'LOCATION' | 'EPISODE' | 'FRAGMENT_GROUP' | 'THEORY',
  profileId: string
}
```

**Output:**
```typescript
{
  profile: Profile | null,
  found: boolean
}
```

**Features:**
- User isolation enforced via context.userId
- Returns null if profile doesn't exist
- Supports all profile types

**Example:**
```typescript
const tool = new GetProfileTool();
const result = await tool.execute(
  {
    profileType: 'CHARACTER',
    profileId: 'rena'
  },
  {
    userId: 'user-123',
    sessionId: 'session-456'
  }
);
```

### UpdateProfileTool

Updates an existing profile.

**Input:**
```typescript
{
  profile: Profile  // Full profile object with all required fields
}
```

**Output:**
```typescript
{
  profile: Profile,
  updated: boolean
}
```

**Features:**
- User isolation enforced - rejects profiles from other users
- Profile must already exist (use createProfile for new profiles)
- Automatically updates `updatedAt` timestamp
- Validates all required base fields

**Example:**
```typescript
const tool = new UpdateProfileTool();
const result = await tool.execute(
  {
    profile: {
      profileId: 'rena',
      profileType: 'CHARACTER',
      userId: 'user-123',
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      characterName: 'Rena Ryuugu',
      appearances: [],
      relationships: [],
      traits: ['kind', 'mysterious'],
      knownFacts: []
    }
  },
  {
    userId: 'user-123',
    sessionId: 'session-456'
  }
);
```

### ListProfilesTool

Lists all profiles or profiles of a specific type for a user.

**Input:**
```typescript
{
  profileType?: 'CHARACTER' | 'LOCATION' | 'EPISODE' | 'FRAGMENT_GROUP' | 'THEORY'
}
```

**Output:**
```typescript
{
  profiles: Profile[],
  count: number,
  profileType?: string
}
```

**Features:**
- User isolation enforced - only returns profiles for requesting user
- Optional filtering by profile type
- Returns empty array if no profiles found
- Efficient for large numbers of profiles

**Example:**
```typescript
const tool = new ListProfilesTool();

// List all profiles
const allProfiles = await tool.execute(
  {},
  {
    userId: 'user-123',
    sessionId: 'session-456'
  }
);

// List only CHARACTER profiles
const characterProfiles = await tool.execute(
  {
    profileType: 'CHARACTER'
  },
  {
    userId: 'user-123',
    sessionId: 'session-456'
  }
);
```

## User Isolation

All tools enforce strict user isolation:
- Tools only access profiles belonging to the requesting user (via context.userId)
- UpdateProfileTool explicitly rejects attempts to update other users' profiles
- GetProfileTool and ListProfilesTool automatically scope queries to the requesting user

## Error Handling

All tools use the base tool error handling:
- Input validation via Zod schemas
- Graceful error handling with user-friendly messages
- Comprehensive logging of all operations
- Execution time tracking

## Testing

Each tool has comprehensive unit tests covering:
- Basic functionality
- User isolation enforcement
- Error handling
- Input validation
- All profile types

Run tests:
```bash
pnpm test -- src/agents/profile/tools/__tests__
```

## Requirements

These tools implement Requirements 6.1 and 6.2 from the AgentCore Migration spec:
- 6.1: Tools have clear input/output schemas
- 6.2: Tools return structured results and propagate errors appropriately
