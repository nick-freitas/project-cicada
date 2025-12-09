/**
 * Profile Agent for AgentCore
 * 
 * Specialized agent for profile management operations. This agent uses explicit
 * operation classification (GET, UPDATE, LIST) and direct tool invocation.
 * All operations are scoped to userId for strict data isolation.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../base';
import { GetProfileTool } from './tools/get-profile-tool';
import { UpdateProfileTool } from './tools/update-profile-tool';
import { ListProfilesTool } from './tools/list-profiles-tool';

/**
 * Profile operation types
 */
type ProfileOperationType = 'GET' | 'UPDATE' | 'LIST' | 'UNKNOWN';

/**
 * Profile operation classification result
 */
interface ProfileOperation {
  type: ProfileOperationType;
  profileId?: string;
  profileType?: string;
  data?: Record<string, any>;
}

/**
 * Profile Agent Configuration
 */
const PROFILE_AGENT_SYSTEM_PROMPT = `You are CICADA's Profile Agent, specialized in managing user profiles.

Your responsibilities:
1. Manage character profiles (traits, relationships, development)
2. Manage location profiles (descriptions, significance)
3. Manage episode profiles (summaries, key events)
4. Manage theory profiles (hypotheses, evidence, status)
5. Ensure all operations are scoped to the current user

You can perform these operations:
- GET: Retrieve a specific profile
- UPDATE: Modify an existing profile
- LIST: Show all profiles or profiles of a specific type

Always maintain data isolation - users can only access their own profiles.`;

/**
 * Profile Agent
 * 
 * This agent provides deterministic profile management with explicit
 * operation classification and direct tool invocation. All operations
 * are scoped to userId for strict data isolation.
 */
export class ProfileAgent extends CICADAAgentBase {
  private getProfileTool: GetProfileTool;
  private updateProfileTool: UpdateProfileTool;
  private listProfilesTool: ListProfilesTool;

  constructor() {
    super({
      name: 'CICADA-Profile',
      description: 'Profile management specialist',
      systemPrompt: PROFILE_AGENT_SYSTEM_PROMPT,
      modelId: 'us.amazon.nova-lite-v1:0',
      maxTokens: 2048,
      temperature: 0.7,
    });

    // Initialize profile service tools
    // Requirement 4.2: Register Profile Service tools
    this.getProfileTool = new GetProfileTool();
    this.updateProfileTool = new UpdateProfileTool();
    this.listProfilesTool = new ListProfilesTool();

    this.logActivity('info', 'Profile Agent initialized', {
      tools: ['getProfile', 'updateProfile', 'listProfiles'],
    });
  }

  /**
   * Invoke the Profile Agent with explicit operation classification
   * 
   * This method uses deterministic classification to determine the operation
   * type and directly invokes the appropriate tool.
   * 
   * Requirements:
   * - 4.1: Maintain all existing functionality
   * - 4.2: Explicitly invoke profile service tools
   * - 4.3: Persist changes to DynamoDB
   * - 4.4: Provide meaningful error messages
   * - 4.5: Stream responses via WebSocket
   */
  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    const startTime = Date.now();

    try {
      // Validate identity
      // Requirement 4.4: User isolation - all operations scoped to userId
      this.validateIdentity(params.identity);

      // Log invocation
      this.logActivity('info', 'Profile Agent invoked', {
        userId: params.identity.userId,
        query: params.query.substring(0, 50),
      });

      // Requirement 4.2: Explicit operation classification (GET, UPDATE, LIST)
      const operation = this.classifyProfileOperation(params.query);

      // Log classification
      this.logActivity('info', 'Profile operation classified', {
        userId: params.identity.userId,
        operationType: operation.type,
        profileId: operation.profileId,
        profileType: operation.profileType,
      });

      // Requirement 4.2: Direct tool invocation based on operation type
      let result: AgentInvocationResult;

      switch (operation.type) {
        case 'GET':
          result = await this.handleGetProfile(
            params.identity.userId,
            operation.profileId!,
            operation.profileType,
            params
          );
          break;

        case 'UPDATE':
          result = await this.handleUpdateProfile(
            params.identity.userId,
            operation.profileId!,
            operation.data || {},
            params
          );
          break;

        case 'LIST':
          result = await this.handleListProfiles(
            params.identity.userId,
            operation.profileType,
            params
          );
          break;

        case 'UNKNOWN':
        default:
          // Use LLM to understand the request and provide guidance
          result = await this.handleUnknownOperation(params);
          break;
      }

      const processingTime = Date.now() - startTime;

      // Log success
      this.logActivity('info', 'Profile Agent completed', {
        userId: params.identity.userId,
        operationType: operation.type,
        processingTime,
      });

      return {
        ...result,
        metadata: {
          ...result.metadata,
          agentsInvoked: ['ProfileAgent'],
          processingTime,
        },
      };
    } catch (error) {
      // Requirement 4.4: Provide meaningful error messages
      this.logActivity('error', 'Profile Agent failed', {
        userId: params.identity.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: this.formatError(error as Error),
        metadata: {
          agentsInvoked: ['ProfileAgent'],
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Classify profile operation using explicit keyword-based logic
   * 
   * This method uses simple keyword matching to determine operation type.
   * No LLM decision-making - purely deterministic.
   * 
   * @param query - User query
   * @returns Profile operation classification
   */
  private classifyProfileOperation(query: string): ProfileOperation {
    const lowerQuery = query.toLowerCase();

    // Extract profile type if mentioned
    const profileType = this.extractProfileType(lowerQuery);

    // GET operation patterns
    const getKeywords = [
      'show',
      'get',
      'view',
      'display',
      'see',
      'what is',
      'tell me about',
      'find',
      'retrieve',
    ];

    if (getKeywords.some(keyword => lowerQuery.includes(keyword))) {
      const profileId = this.extractProfileId(query);
      if (profileId) {
        return {
          type: 'GET',
          profileId,
          profileType,
        };
      }
    }

    // UPDATE operation patterns
    const updateKeywords = [
      'update',
      'save',
      'edit',
      'modify',
      'change',
      'set',
      'add to',
      'remove from',
    ];

    if (updateKeywords.some(keyword => lowerQuery.includes(keyword))) {
      const profileId = this.extractProfileId(query);
      if (profileId) {
        return {
          type: 'UPDATE',
          profileId,
          profileType,
          data: {}, // Data would be extracted from query in a more sophisticated implementation
        };
      }
    }

    // LIST operation patterns
    const listKeywords = [
      'list',
      'show all',
      'show me all',
      'all my',
      'my profiles',
      'what profiles',
      'which profiles',
    ];

    if (listKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return {
        type: 'LIST',
        profileType,
      };
    }

    // If no specific pattern matches, return UNKNOWN
    return {
      type: 'UNKNOWN',
    };
  }

  /**
   * Extract profile type from query
   * 
   * @param lowerQuery - Lowercase query string
   * @returns Profile type or undefined
   */
  private extractProfileType(lowerQuery: string): string | undefined {
    if (lowerQuery.includes('character')) return 'CHARACTER';
    if (lowerQuery.includes('location')) return 'LOCATION';
    if (lowerQuery.includes('episode')) return 'EPISODE';
    if (lowerQuery.includes('fragment')) return 'FRAGMENT_GROUP';
    if (lowerQuery.includes('theory') || lowerQuery.includes('theories')) return 'THEORY';

    return undefined;
  }

  /**
   * Extract profile ID from query
   * 
   * This is a simple implementation that looks for quoted strings or
   * capitalized names. In a more sophisticated implementation, we would
   * use NER or entity extraction.
   * 
   * @param query - User query
   * @returns Profile ID or undefined
   */
  private extractProfileId(query: string): string | undefined {
    // Look for quoted strings
    const quotedMatch = query.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return this.normalizeProfileId(quotedMatch[1]);
    }

    // Look for capitalized names (simple heuristic)
    const capitalizedMatch = query.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
    if (capitalizedMatch) {
      return this.normalizeProfileId(capitalizedMatch[1]);
    }

    return undefined;
  }

  /**
   * Normalize profile ID to consistent format
   * 
   * @param id - Raw profile ID
   * @returns Normalized profile ID
   */
  private normalizeProfileId(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Handle GET profile operation
   * 
   * Requirement 4.2: Explicitly invoke profile service tools
   * Requirement 4.4: User isolation - all operations scoped to userId
   */
  private async handleGetProfile(
    userId: string,
    profileId: string,
    profileType: string | undefined,
    params: AgentInvocationParams
  ): Promise<AgentInvocationResult> {
    this.logActivity('info', 'Getting profile', {
      userId,
      profileId,
      profileType,
    });

    // If profile type not specified, try to infer or ask user
    if (!profileType) {
      return {
        content: `I need to know what type of profile you're looking for. Please specify: character, location, episode, fragment group, or theory.`,
        metadata: {
          toolsUsed: [],
        },
      };
    }

    // Invoke get profile tool
    const toolResult = await this.getProfileTool.execute(
      {
        userId,
        profileType,
        profileId,
      },
      {
        userId,
        sessionId: params.memory.sessionId,
      }
    );

    if (!toolResult.success || !toolResult.data) {
      // Profile not found - provide helpful message
      return {
        content: `I couldn't find a ${profileType.toLowerCase()} profile for "${profileId}". Would you like to create one?`,
        metadata: {
          toolsUsed: ['getProfile'],
        },
      };
    }

    // Format profile for display using LLM
    const profile = toolResult.data;
    const conversationContext = this.extractContext(params.memory);

    let prompt = `Here is the ${profileType.toLowerCase()} profile:\n\n`;
    prompt += JSON.stringify(profile, null, 2);
    prompt += `\n\nFormat this profile in a user-friendly way. Include all relevant information.`;

    if (conversationContext) {
      prompt = `Previous conversation:\n${conversationContext}\n\n${prompt}`;
    }

    const agentResult = await this.invoke(prompt);
    const responseContent = agentResult.toString();

    return {
      content: responseContent,
      metadata: {
        toolsUsed: ['getProfile'],
      },
    };
  }

  /**
   * Handle UPDATE profile operation
   * 
   * Requirement 4.2: Explicitly invoke profile service tools
   * Requirement 4.3: Persist changes to DynamoDB
   * Requirement 4.4: User isolation - all operations scoped to userId
   */
  private async handleUpdateProfile(
    userId: string,
    profileId: string,
    data: Record<string, any>,
    params: AgentInvocationParams
  ): Promise<AgentInvocationResult> {
    this.logActivity('info', 'Updating profile', {
      userId,
      profileId,
    });

    // Use LLM to extract update information from query
    const conversationContext = this.extractContext(params.memory);

    let prompt = `User wants to update a profile. Here's their request:\n\n`;
    prompt += `"${params.query}"\n\n`;
    prompt += `Extract the following information:\n`;
    prompt += `1. Profile type (CHARACTER, LOCATION, EPISODE, FRAGMENT_GROUP, or THEORY)\n`;
    prompt += `2. Profile ID\n`;
    prompt += `3. What fields to update and their new values\n\n`;
    prompt += `Respond in JSON format with: { "profileType": "...", "profileId": "...", "updates": {...} }`;

    if (conversationContext) {
      prompt = `Previous conversation:\n${conversationContext}\n\n${prompt}`;
    }

    const agentResult = await this.invoke(prompt);
    const responseContent = agentResult.toString();

    // Try to parse JSON from response
    let updateInfo: any;
    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                       responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        updateInfo = JSON.parse(jsonStr);
      } else {
        throw new Error('Could not extract update information');
      }
    } catch (error) {
      return {
        content: `I couldn't understand what you want to update. Please be more specific about:\n1. The profile type (character, location, episode, theory)\n2. The profile name\n3. What you want to change`,
        metadata: {
          toolsUsed: [],
        },
      };
    }

    // Invoke update profile tool
    // Requirement 4.3: Persist changes to DynamoDB
    const toolResult = await this.updateProfileTool.execute(
      {
        userId,
        profileType: updateInfo.profileType,
        profileId: updateInfo.profileId || profileId,
        updates: updateInfo.updates || data,
      },
      {
        userId,
        sessionId: params.memory.sessionId,
      }
    );

    if (!toolResult.success) {
      // Requirement 4.4: Provide meaningful error messages
      return {
        content: `I couldn't update the profile: ${toolResult.error}`,
        metadata: {
          toolsUsed: ['updateProfile'],
        },
      };
    }

    return {
      content: `Profile updated successfully! The ${updateInfo.profileType.toLowerCase()} profile for "${updateInfo.profileId || profileId}" has been saved.`,
      metadata: {
        toolsUsed: ['updateProfile'],
      },
    };
  }

  /**
   * Handle LIST profiles operation
   * 
   * Requirement 4.2: Explicitly invoke profile service tools
   * Requirement 4.4: User isolation - all operations scoped to userId
   */
  private async handleListProfiles(
    userId: string,
    profileType: string | undefined,
    params: AgentInvocationParams
  ): Promise<AgentInvocationResult> {
    this.logActivity('info', 'Listing profiles', {
      userId,
      profileType,
    });

    // Invoke list profiles tool
    const toolResult = await this.listProfilesTool.execute(
      {
        userId,
        profileType,
      },
      {
        userId,
        sessionId: params.memory.sessionId,
      }
    );

    if (!toolResult.success || !toolResult.data) {
      return {
        content: `I couldn't retrieve your profiles: ${toolResult.error}`,
        metadata: {
          toolsUsed: ['listProfiles'],
        },
      };
    }

    const profiles = toolResult.data;

    if (profiles.length === 0) {
      const typeStr = profileType ? `${profileType.toLowerCase()} ` : '';
      return {
        content: `You don't have any ${typeStr}profiles yet. Would you like to create one?`,
        metadata: {
          toolsUsed: ['listProfiles'],
        },
      };
    }

    // Format profile list using LLM
    const conversationContext = this.extractContext(params.memory);

    let prompt = `Here are the user's profiles:\n\n`;
    prompt += JSON.stringify(profiles, null, 2);
    prompt += `\n\nFormat this list in a user-friendly way. Group by type if multiple types are present. Include key information for each profile.`;

    if (conversationContext) {
      prompt = `Previous conversation:\n${conversationContext}\n\n${prompt}`;
    }

    const agentResult = await this.invoke(prompt);
    const responseContent = agentResult.toString();

    return {
      content: responseContent,
      metadata: {
        toolsUsed: ['listProfiles'],
      },
    };
  }

  /**
   * Handle unknown operation - use LLM to understand and provide guidance
   */
  private async handleUnknownOperation(
    params: AgentInvocationParams
  ): Promise<AgentInvocationResult> {
    this.logActivity('info', 'Handling unknown profile operation', {
      userId: params.identity.userId,
    });

    const conversationContext = this.extractContext(params.memory);

    let prompt = `User query: "${params.query}"\n\n`;
    prompt += `This appears to be a profile-related request, but I need clarification.\n\n`;
    prompt += `I can help with:\n`;
    prompt += `- Viewing profiles (e.g., "Show me Rena's character profile")\n`;
    prompt += `- Updating profiles (e.g., "Update Rena's profile to add...")\n`;
    prompt += `- Listing profiles (e.g., "Show all my character profiles")\n\n`;
    prompt += `Please help the user understand what information I need to assist them.`;

    if (conversationContext) {
      prompt = `Previous conversation:\n${conversationContext}\n\n${prompt}`;
    }

    const agentResult = await this.invoke(prompt);
    const responseContent = agentResult.toString();

    return {
      content: responseContent,
      metadata: {
        toolsUsed: [],
      },
    };
  }

  /**
   * Format error for user-friendly display
   * 
   * Requirement 4.4: Provide meaningful error messages
   */
  protected formatError(error: Error): string {
    this.logActivity('error', 'Profile Agent error occurred', {
      error: error.message,
      stack: error.stack,
    });

    return 'I encountered an error managing profiles. Please try again or rephrase your request.';
  }
}
