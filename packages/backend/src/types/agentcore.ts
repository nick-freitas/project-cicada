/**
 * Type definitions for AWS AgentCore integration
 * 
 * These types provide structure for working with Bedrock Agents
 * using the AWS SDK for JavaScript v3.
 */

import type {
  InvokeAgentCommandInput,
  InvokeAgentCommandOutput,
  ResponseStream,
} from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Configuration for an AgentCore agent
 */
export interface AgentConfig {
  agentId: string;
  agentAliasId: string;
  agentName: string;
  foundationModel: string;
  streaming: boolean;
}

/**
 * Request to invoke an agent
 */
export interface AgentInvocationRequest {
  agentId: string;
  agentAliasId: string;
  sessionId: string;
  inputText: string;
  enableTrace?: boolean;
  endSession?: boolean;
  sessionState?: {
    sessionAttributes?: Record<string, string>;
    promptSessionAttributes?: Record<string, string>;
  };
}

/**
 * Response from an agent invocation
 */
export interface AgentInvocationResponse {
  sessionId: string;
  completion: AsyncIterable<ResponseStream>;
  contentType?: string;
  memoryId?: string;
}

/**
 * Streaming chunk from an agent
 */
export interface AgentStreamChunk {
  type: 'chunk' | 'trace' | 'complete' | 'error';
  content?: string;
  trace?: AgentTrace;
  error?: string;
}

/**
 * Agent trace information for debugging
 */
export interface AgentTrace {
  traceId?: string;
  agentId?: string;
  agentAliasId?: string;
  sessionId?: string;
  timestamp?: Date;
  event?: string;
  details?: Record<string, any>;
}

/**
 * Configuration for the Orchestrator Agent
 */
export interface OrchestratorAgentConfig extends AgentConfig {
  agentName: 'CICADA-Orchestrator';
  tools: OrchestratorTool[];
}

/**
 * Tool definition for Orchestrator Agent
 */
export interface OrchestratorTool {
  name: 'invoke_query_agent' | 'invoke_theory_agent' | 'invoke_profile_agent';
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Request to the Orchestrator Agent
 */
export interface OrchestratorRequest {
  userId: string;
  query: string;
  sessionId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
}

/**
 * Response from the Orchestrator Agent
 */
export interface OrchestratorResponse {
  content: string;
  citations?: Citation[];
  profileUpdates?: string[];
  agentsInvoked: string[];
}

/**
 * Configuration for the Query Agent
 */
export interface QueryAgentConfig extends AgentConfig {
  agentName: 'CICADA-Query';
  tools: QueryAgentTool[];
}

/**
 * Tool definition for Query Agent
 */
export interface QueryAgentTool {
  name: 'search_knowledge_base' | 'format_citation' | 'analyze_nuance';
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Request to the Query Agent
 */
export interface QueryAgentRequest {
  query: string;
  userId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
  characterFocus?: string;
}

/**
 * Response from the Query Agent
 */
export interface QueryAgentResponse {
  content: string;
  citations: Citation[];
  hasDirectEvidence: boolean;
  nuanceAnalysis?: NuanceAnalysis[];
}

/**
 * Configuration for the Theory Agent
 */
export interface TheoryAgentConfig extends AgentConfig {
  agentName: 'CICADA-Theory';
  tools: TheoryAgentTool[];
}

/**
 * Tool definition for Theory Agent
 */
export interface TheoryAgentTool {
  name: 'invoke_query_agent' | 'access_profile' | 'update_profile';
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Request to the Theory Agent
 */
export interface TheoryAgentRequest {
  userId: string;
  theoryName?: string;
  theoryDescription: string;
  userChallenge?: string;
  requestRefinement?: boolean;
  episodeContext?: string[];
}

/**
 * Response from the Theory Agent
 */
export interface TheoryAgentResponse {
  analysis: string;
  supportingEvidence: Citation[];
  contradictingEvidence: Citation[];
  refinementSuggestions?: TheoryRefinement[];
  profileUpdates: ProfileUpdate[];
  profileCorrections: ProfileCorrection[];
}

/**
 * Configuration for the Profile Agent
 */
export interface ProfileAgentConfig extends AgentConfig {
  agentName: 'CICADA-Profile';
  tools: ProfileAgentTool[];
}

/**
 * Tool definition for Profile Agent
 */
export interface ProfileAgentTool {
  name: 'extract_entity' | 'get_profile' | 'create_profile' | 'update_profile';
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Request to the Profile Agent
 */
export interface ProfileAgentRequest {
  userId: string;
  conversationContext: string;
  citations?: Citation[];
  extractionMode?: 'auto' | 'explicit';
}

/**
 * Response from the Profile Agent
 */
export interface ProfileAgentResponse {
  extractedInformation: ExtractedInformation[];
  updatedProfiles: string[];
  createdProfiles: string[];
}

/**
 * Citation structure (from shared-types)
 */
export interface Citation {
  episodeId: string;
  episodeName: string;
  chapterId: string;
  chapterName: string;
  messageId: string;
  textJPN?: string;
  textENG: string;
  speaker?: string;
  timestamp?: string;
}

/**
 * Nuance analysis result
 */
export interface NuanceAnalysis {
  messageId: string;
  japaneseText: string;
  englishText: string;
  nuances: string[];
  culturalContext?: string;
}

/**
 * Theory refinement suggestion
 */
export interface TheoryRefinement {
  originalTheory: string;
  refinedTheory: string;
  reasoning: string;
  confidence: number;
}

/**
 * Profile update information
 */
export interface ProfileUpdate {
  profileId: string;
  profileType: 'character' | 'location' | 'episode' | 'fragment_group' | 'theory';
  field: string;
  oldValue?: any;
  newValue: any;
  source: string;
}

/**
 * Profile correction information
 */
export interface ProfileCorrection {
  profileId: string;
  profileType: 'character' | 'location' | 'episode' | 'fragment_group' | 'theory';
  field: string;
  incorrectValue: any;
  correctValue: any;
  reasoning: string;
}

/**
 * Extracted information from conversation
 */
export interface ExtractedInformation {
  entityType: 'character' | 'location' | 'episode' | 'fragment_group' | 'theory';
  entityName: string;
  attributes: Record<string, any>;
  confidence: number;
  source: Citation[];
}

/**
 * Error thrown during agent invocation
 */
export class AgentInvocationError extends Error {
  constructor(
    message: string,
    public agentName: string,
    public retryable: boolean,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AgentInvocationError';
  }
}

/**
 * Agent invocation options
 */
export interface AgentInvocationOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  enableTrace?: boolean;
}
