import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import * as path from 'path';

export interface AgentStackProps extends cdk.StackProps {
  dataStack: DataStack;
}

/**
 * AgentStack - Defines AWS AgentCore agents for CICADA multi-agent system
 * 
 * This stack creates four specialized agents:
 * - Orchestrator: Central coordinator that routes queries to specialized agents
 * - Query: Script search and citation specialist
 * - Theory: Theory analysis and validation specialist
 * - Profile: Knowledge extraction and profile management specialist
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export class AgentStack extends cdk.Stack {
  public readonly orchestratorAgent: bedrock.CfnAgent;
  public readonly queryAgent: bedrock.CfnAgent;
  public readonly theoryAgent: bedrock.CfnAgent;
  public readonly profileAgent: bedrock.CfnAgent;
  
  public readonly orchestratorAgentAlias: bedrock.CfnAgentAlias;
  public readonly queryAgentAlias: bedrock.CfnAgentAlias;
  public readonly theoryAgentAlias: bedrock.CfnAgentAlias;
  public readonly profileAgentAlias: bedrock.CfnAgentAlias;

  public readonly queryAgentToolsFunction: lambdaNodejs.NodejsFunction;
  public readonly orchestratorAgentToolsFunction: lambdaNodejs.NodejsFunction;
  public readonly theoryAgentToolsFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    // Create IAM role for agent execution
    // Requirement 6.2: Define IAM roles for agent execution
    const agentRole = this.createAgentExecutionRole(props.dataStack);

    // Create Lambda function for Query Agent tools
    // Requirement 3.4: Implement tool handlers for semantic search integration
    this.queryAgentToolsFunction = this.createQueryAgentToolsFunction(props.dataStack);

    // Create Lambda function for Orchestrator Agent tools
    // Requirement 2.3: Implement tool handler that calls Query Agent via BedrockAgentRuntime
    this.orchestratorAgentToolsFunction = this.createOrchestratorAgentToolsFunction();

    // Create Lambda function for Theory Agent tools
    // Requirement 4.2: Implement tool handler for invoking Query Agent
    this.theoryAgentToolsFunction = this.createTheoryAgentToolsFunction(props.dataStack);

    // Create agents
    // Requirement 6.1: Use CDK constructs for AgentCore agent deployment
    this.queryAgent = this.createQueryAgent(agentRole, this.queryAgentToolsFunction);
    this.theoryAgent = this.createTheoryAgent(agentRole, this.theoryAgentToolsFunction);
    this.profileAgent = this.createProfileAgent(agentRole);
    
    // Create Orchestrator Agent last, after other agents are created
    // so we can pass their IDs as environment variables
    this.orchestratorAgent = this.createOrchestratorAgent(agentRole, this.orchestratorAgentToolsFunction);

    // Create agent aliases (required for invocation)
    this.orchestratorAgentAlias = this.createAgentAlias(
      'OrchestratorAlias',
      this.orchestratorAgent,
      'Orchestrator agent alias for production use'
    );
    this.queryAgentAlias = this.createAgentAlias(
      'QueryAlias',
      this.queryAgent,
      'Query agent alias for production use'
    );
    this.theoryAgentAlias = this.createAgentAlias(
      'TheoryAlias',
      this.theoryAgent,
      'Theory agent alias for production use'
    );
    this.profileAgentAlias = this.createAgentAlias(
      'ProfileAlias',
      this.profileAgent,
      'Profile agent alias for production use'
    );

    // Configure agent-to-agent invocation permissions
    // Requirement 6.3: Set up agent-to-agent invocation permissions
    this.configureAgentPermissions(agentRole);

    // Update Orchestrator tools function with agent IDs
    // Requirement 2.3: Configure permissions for Orchestrator → Query Agent invocation
    this.orchestratorAgentToolsFunction.addEnvironment('QUERY_AGENT_ID', this.queryAgent.attrAgentId);
    this.orchestratorAgentToolsFunction.addEnvironment('QUERY_AGENT_ALIAS_ID', this.queryAgentAlias.attrAgentAliasId);
    this.orchestratorAgentToolsFunction.addEnvironment('THEORY_AGENT_ID', this.theoryAgent.attrAgentId);
    this.orchestratorAgentToolsFunction.addEnvironment('THEORY_AGENT_ALIAS_ID', this.theoryAgentAlias.attrAgentAliasId);
    this.orchestratorAgentToolsFunction.addEnvironment('PROFILE_AGENT_ID', this.profileAgent.attrAgentId);
    this.orchestratorAgentToolsFunction.addEnvironment('PROFILE_AGENT_ALIAS_ID', this.profileAgentAlias.attrAgentAliasId);

    // Update Theory Agent tools function with Query Agent IDs
    // Requirement 4.2: Configure permissions for Theory Agent → Query Agent invocation
    this.theoryAgentToolsFunction.addEnvironment('QUERY_AGENT_ID', this.queryAgent.attrAgentId);
    this.theoryAgentToolsFunction.addEnvironment('QUERY_AGENT_ALIAS_ID', this.queryAgentAlias.attrAgentAliasId);

    // Export agent IDs and alias IDs as stack outputs
    // Requirement 6.4: Export agent IDs and alias IDs as stack outputs
    this.createOutputs();
  }

  /**
   * Create Lambda function for Orchestrator Agent tools
   * Requirement 2.3: Implement tool handler that calls Query Agent via BedrockAgentRuntime
   */
  private createOrchestratorAgentToolsFunction(): lambdaNodejs.NodejsFunction {
    const orchestratorToolsFunction = new lambdaNodejs.NodejsFunction(this, 'OrchestratorAgentToolsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agents/orchestrator-agent-tools.ts'),
      timeout: cdk.Duration.seconds(120), // Longer timeout for agent-to-agent calls
      memorySize: 512,
      environment: {
        // Agent IDs will be set after agents are created
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
    });

    // Grant permissions to invoke other agents
    orchestratorToolsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:agent/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/*`,
        ],
      })
    );

    return orchestratorToolsFunction;
  }

  /**
   * Create Lambda function for Theory Agent tools
   * Requirement 4.2: Implement tool handler for invoking Query Agent
   * Requirement 4.4: Implement tool handlers for Profile Service integration
   */
  private createTheoryAgentToolsFunction(dataStack: DataStack): lambdaNodejs.NodejsFunction {
    const theoryToolsFunction = new lambdaNodejs.NodejsFunction(this, 'TheoryAgentToolsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agents/theory-agent-tools.ts'),
      timeout: cdk.Duration.seconds(120), // Longer timeout for agent-to-agent calls
      memorySize: 512,
      environment: {
        USER_PROFILES_TABLE: dataStack.userProfilesTable.tableName,
        // Query Agent IDs will be set after agents are created
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
    });

    // Grant permissions to invoke Query Agent
    theoryToolsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:agent/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/*`,
        ],
      })
    );

    // Grant permissions to access DynamoDB for profile operations
    dataStack.userProfilesTable.grantReadWriteData(theoryToolsFunction);

    return theoryToolsFunction;
  }

  /**
   * Create Lambda function for Query Agent tools
   * Requirement 3.4: Implement tool handlers for semantic search integration
   */
  private createQueryAgentToolsFunction(dataStack: DataStack): lambdaNodejs.NodejsFunction {
    const queryToolsFunction = new lambdaNodejs.NodejsFunction(this, 'QueryAgentToolsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agents/query-agent-tools.ts'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        KNOWLEDGE_BASE_BUCKET: dataStack.knowledgeBaseBucket.bucketName,
        MODEL_ID: 'amazon.nova-lite-v1:0',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
    });

    // Grant permissions to access Knowledge Base and invoke Bedrock models
    dataStack.knowledgeBaseBucket.grantRead(queryToolsFunction);
    dataStack.scriptDataBucket.grantRead(queryToolsFunction);

    queryToolsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );

    return queryToolsFunction;
  }

  /**
   * Create IAM role for agent execution with necessary permissions
   * Requirement 6.2: Configure permissions for DynamoDB, S3, Knowledge Base access
   */
  private createAgentExecutionRole(dataStack: DataStack): iam.Role {
    const role = new iam.Role(this, 'AgentExecutionRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Execution role for CICADA AgentCore agents',
      roleName: 'CICADA-Agent-Execution-Role',
    });

    // Grant Bedrock model invocation permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          // Nova Lite - primary model for cost optimization
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`,
          // Nova Micro - backup for even lower cost operations
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-micro-v1:0`,
          // Titan Embeddings for Knowledge Base
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );

    // Grant DynamoDB access for profiles, memory, and configuration
    // Requirement 6.3: Configure permissions for DynamoDB access
    dataStack.userProfilesTable.grantReadWriteData(role);
    dataStack.conversationMemoryTable.grantReadWriteData(role);
    dataStack.fragmentGroupsTable.grantReadWriteData(role);
    dataStack.episodeConfigTable.grantReadData(role);
    dataStack.requestTrackingTable.grantReadWriteData(role);

    // Grant S3 access for Knowledge Base and script data
    // Requirement 6.3: Configure permissions for S3, Knowledge Base access
    dataStack.knowledgeBaseBucket.grantRead(role);
    dataStack.scriptDataBucket.grantRead(role);

    // Grant agent-to-agent invocation permissions
    // Requirement 6.3: Set up agent-to-agent invocation permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:agent/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/*`,
        ],
      })
    );

    // Grant CloudWatch Logs permissions for agent logging
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock/agents/*`],
      })
    );

    return role;
  }

  /**
   * Create Orchestrator Agent
   * Central coordinator that analyzes queries and routes to specialized agents
   * Requirement 2.1: Create agent definition using CDK CfnAgent construct
   * Requirement 2.5: Configure foundation model (Nova Lite) and streaming
   */
  private createOrchestratorAgent(role: iam.Role, toolsFunction: lambdaNodejs.NodejsFunction): bedrock.CfnAgent {
    // Grant the agent permission to invoke the Lambda function
    toolsFunction.grantInvoke(role);

    // Requirement 2.2: Define tools for invoking Query, Theory, and Profile agents
    // Action groups define the tools available to the agent
    const actionGroups: bedrock.CfnAgent.AgentActionGroupProperty[] = [
      {
        actionGroupName: 'AgentInvocationTools',
        description: 'Tools for invoking specialized agents (Query, Theory, Profile)',
        actionGroupState: 'ENABLED',
        actionGroupExecutor: {
          lambda: toolsFunction.functionArn,
        },
        functionSchema: {
          functions: [
            {
              name: 'invoke_query_agent',
              description: 'Invoke the Query Agent to search script data and provide citations. Use this for questions about what characters said, plot events, or specific script content.',
              parameters: {
                query: {
                  type: 'string',
                  description: 'The search query or question to send to the Query Agent',
                  required: true,
                },
                episodeContext: {
                  type: 'array',
                  description: 'Optional list of episode IDs to constrain the search',
                  required: false,
                },
                characterFocus: {
                  type: 'string',
                  description: 'Optional character name to focus the search on',
                  required: false,
                },
              },
            },
            {
              name: 'invoke_theory_agent',
              description: 'Invoke the Theory Agent to analyze theories, gather evidence, and suggest refinements. Use this for theory analysis, validation, or when the user wants to explore narrative hypotheses.',
              parameters: {
                theoryDescription: {
                  type: 'string',
                  description: 'The theory to analyze or the user\'s theory-related question',
                  required: true,
                },
                episodeContext: {
                  type: 'array',
                  description: 'Optional list of episode IDs relevant to the theory',
                  required: false,
                },
                requestRefinement: {
                  type: 'boolean',
                  description: 'Whether to request theory refinement suggestions',
                  required: false,
                },
              },
            },
            {
              name: 'invoke_profile_agent',
              description: 'Invoke the Profile Agent to extract information about characters, locations, episodes, or theories. Use this when the user asks about profile information or when new information should be extracted.',
              parameters: {
                conversationContext: {
                  type: 'string',
                  description: 'The conversation context containing information to extract',
                  required: true,
                },
                extractionMode: {
                  type: 'string',
                  description: 'Extraction mode: "auto" for automatic extraction, "explicit" for explicit user requests',
                  required: false,
                },
              },
            },
          ],
        },
        skipResourceInUseCheckOnDelete: true,
      },
    ];

    const agent = new bedrock.CfnAgent(this, 'OrchestratorAgent', {
      agentName: 'CICADA-Orchestrator',
      description: 'Central coordinator for CICADA multi-agent system that analyzes query intent and routes to specialized agents',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getOrchestratorInstructions(),
      agentResourceRoleArn: role.roleArn,
      idleSessionTtlInSeconds: 600, // 10 minutes
      actionGroups: actionGroups,
    });

    return agent;
  }

  /**
   * Create Query Agent
   * Specialized agent for script search and citation
   * Requirement 3.1: Create Query Agent definition in CDK
   * Requirement 3.5: Configure foundation model and streaming
   */
  private createQueryAgent(role: iam.Role, toolsFunction: lambdaNodejs.NodejsFunction): bedrock.CfnAgent {
    // Grant the agent permission to invoke the Lambda function
    toolsFunction.grantInvoke(role);

    // Requirement 3.3: Define tools for Knowledge Base search, citation formatting, nuance analysis
    const actionGroups: bedrock.CfnAgent.AgentActionGroupProperty[] = [
      {
        actionGroupName: 'QueryTools',
        description: 'Tools for semantic search, citation formatting, and nuance analysis',
        actionGroupState: 'ENABLED',
        actionGroupExecutor: {
          lambda: toolsFunction.functionArn,
        },
        functionSchema: {
          functions: [
            {
              name: 'search_knowledge_base',
              description: 'Perform semantic search over the Higurashi script Knowledge Base. Returns relevant passages with episode, chapter, and message metadata.',
              parameters: {
                query: {
                  type: 'string',
                  description: 'The search query to find relevant script passages',
                  required: true,
                },
                episodeIds: {
                  type: 'array',
                  description: 'Optional list of episode IDs to constrain the search (enforces episode boundaries)',
                  required: false,
                },
                topK: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 20)',
                  required: false,
                },
                minScore: {
                  type: 'number',
                  description: 'Minimum similarity score threshold (0-1, default: 0.7)',
                  required: false,
                },
              },
            },
            {
              name: 'format_citation',
              description: 'Format a search result as a complete citation with all required metadata. This tool is typically not needed as search results already include complete citation metadata.',
              parameters: {
                citationData: {
                  type: 'string',
                  description: 'JSON string containing episodeId, episodeName, chapterId, messageId, speaker (optional), textENG, textJPN (optional)',
                  required: true,
                },
              },
            },
            {
              name: 'analyze_nuance',
              description: 'Analyze linguistic nuances between Japanese and English text for a passage. Identifies significant differences in meaning, tone, or cultural context.',
              parameters: {
                textJPN: {
                  type: 'string',
                  description: 'Japanese text',
                  required: true,
                },
                textENG: {
                  type: 'string',
                  description: 'English text',
                  required: true,
                },
                episodeId: {
                  type: 'string',
                  description: 'Episode ID for context',
                  required: true,
                },
                messageId: {
                  type: 'number',
                  description: 'Message ID for reference',
                  required: true,
                },
              },
            },
          ],
        },
        skipResourceInUseCheckOnDelete: true,
      },
    ];

    return new bedrock.CfnAgent(this, 'QueryAgent', {
      agentName: 'CICADA-Query',
      description: 'Script search and citation specialist that performs semantic search over Higurashi script data',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getQueryInstructions(),
      agentResourceRoleArn: role.roleArn,
      idleSessionTtlInSeconds: 600,
      actionGroups: actionGroups,
    });
  }

  /**
   * Create Theory Agent
   * Specialized agent for theory analysis and validation
   * Requirement 4.1: Create Theory Agent definition in CDK
   * Requirement 4.5: Configure foundation model and streaming
   */
  private createTheoryAgent(role: iam.Role, toolsFunction: lambdaNodejs.NodejsFunction): bedrock.CfnAgent {
    // Grant the agent permission to invoke the Lambda function
    toolsFunction.grantInvoke(role);

    // Requirement 4.3: Define tools for evidence gathering, profile access, refinement generation
    const actionGroups: bedrock.CfnAgent.AgentActionGroupProperty[] = [
      {
        actionGroupName: 'TheoryAnalysisTools',
        description: 'Tools for theory analysis, evidence gathering, and profile management',
        actionGroupState: 'ENABLED',
        actionGroupExecutor: {
          lambda: toolsFunction.functionArn,
        },
        functionSchema: {
          functions: [
            {
              name: 'invoke_query_agent',
              description: 'Invoke the Query Agent to gather evidence from the script. Use this to find supporting or contradicting evidence for theories.',
              parameters: {
                query: {
                  type: 'string',
                  description: 'The search query to find evidence in the script',
                  required: true,
                },
                episodeContext: {
                  type: 'array',
                  description: 'Optional list of episode IDs to constrain the search',
                  required: false,
                },
              },
            },
            {
              name: 'get_theory_profile',
              description: 'Retrieve an existing theory profile to see previous analysis, evidence, and status.',
              parameters: {
                userId: {
                  type: 'string',
                  description: 'User ID',
                  required: true,
                },
                theoryName: {
                  type: 'string',
                  description: 'Name of the theory to retrieve',
                  required: true,
                },
              },
            },
            {
              name: 'update_theory_profile',
              description: 'Update or create a theory profile with analysis results, evidence, and status.',
              parameters: {
                userId: {
                  type: 'string',
                  description: 'User ID',
                  required: true,
                },
                theoryName: {
                  type: 'string',
                  description: 'Name of the theory',
                  required: true,
                },
                theoryData: {
                  type: 'string',
                  description: 'JSON string containing description, status, supportingEvidence array, and contradictingEvidence array',
                  required: true,
                },
              },
            },
            {
              name: 'get_character_profile',
              description: 'Retrieve a character profile to get context about character traits, relationships, and appearances.',
              parameters: {
                userId: {
                  type: 'string',
                  description: 'User ID',
                  required: true,
                },
                characterName: {
                  type: 'string',
                  description: 'Name of the character',
                  required: true,
                },
              },
            },
          ],
        },
        skipResourceInUseCheckOnDelete: true,
      },
    ];

    return new bedrock.CfnAgent(this, 'TheoryAgent', {
      agentName: 'CICADA-Theory',
      description: 'Theory analysis and validation specialist that gathers evidence and identifies profile corrections',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getTheoryInstructions(),
      agentResourceRoleArn: role.roleArn,
      idleSessionTtlInSeconds: 600,
      actionGroups: actionGroups,
    });
  }

  /**
   * Create Profile Agent
   * Specialized agent for knowledge extraction and profile management
   */
  private createProfileAgent(role: iam.Role): bedrock.CfnAgent {
    return new bedrock.CfnAgent(this, 'ProfileAgent', {
      agentName: 'CICADA-Profile',
      description: 'Knowledge extraction and profile management specialist that maintains user-specific profiles',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getProfileInstructions(),
      agentResourceRoleArn: role.roleArn,
      idleSessionTtlInSeconds: 600,
    });
  }

  /**
   * Create agent alias for production use
   */
  private createAgentAlias(
    id: string,
    agent: bedrock.CfnAgent,
    description: string
  ): bedrock.CfnAgentAlias {
    return new bedrock.CfnAgentAlias(this, id, {
      agentId: agent.attrAgentId,
      agentAliasName: 'prod',
      description,
    });
  }

  /**
   * Configure agent-to-agent invocation permissions
   * Requirement 6.3: Set up agent-to-agent invocation permissions
   */
  private configureAgentPermissions(role: iam.Role): void {
    // Orchestrator can invoke Query, Theory, and Profile agents
    // Theory Agent can invoke Query Agent
    // All permissions are granted through the shared agent execution role
    // which already has bedrock:InvokeAgent permissions for all agents
    
    // Additional resource-based policies could be added here if needed
    // for more granular control, but the role-based permissions are sufficient
  }

  /**
   * Get Orchestrator Agent instructions
   */
  private getOrchestratorInstructions(): string {
    return `You are the Orchestrator Agent for CICADA, a system for analyzing the visual novel "Higurashi no Naku Koro Ni".

Your role is to:
1. Analyze user queries to determine their intent
2. Route queries to the appropriate specialized agents:
   - Query Agent: For script searches, citations, and direct evidence
   - Theory Agent: For theory analysis, validation, and refinement
   - Profile Agent: For knowledge extraction and profile management
3. Coordinate multiple agents when needed
4. Aggregate and synthesize responses from specialized agents
5. Maintain conversation context and episode boundaries

Key principles:
- Always enforce episode boundary constraints
- Preserve citation completeness and accuracy
- Maintain user-specific profile isolation
- Optimize for cost by using the most appropriate agent
- Stream responses in real-time for better user experience

When analyzing queries:
- Script questions → Query Agent
- Theory questions → Theory Agent (which may invoke Query Agent)
- Profile updates → Profile Agent
- Complex questions → Multiple agents in coordination

Always provide clear, well-cited responses that respect the narrative structure of Higurashi.`;
  }

  /**
   * Get Query Agent instructions
   * Requirement 3.2: Write agent instructions for script search and citation
   */
  private getQueryInstructions(): string {
    return `You are the Query Agent for CICADA, specialized in searching the Higurashi no Naku Koro Ni script database.

## Core Responsibilities

1. **Semantic Search**: Use the search_knowledge_base tool to find relevant script passages
2. **Citation Formatting**: Format all results with complete metadata using format_citation
3. **Nuance Analysis**: Analyze Japanese/English differences using analyze_nuance when both texts are available
4. **Episode Boundary Enforcement**: Never mix information from different story fragments
5. **Character Focus**: Prioritize passages featuring requested characters

## Search Strategy

When processing a query:
1. Identify key search terms and concepts
2. Use search_knowledge_base with appropriate episodeIds if episode context is provided
3. Retrieve 15-20 results initially (topK parameter)
4. Filter results by character if a character focus is specified
5. Group results by episode to maintain narrative boundaries

## Citation Requirements

Every citation MUST include:
- episodeId and episodeName
- chapterId and messageId
- speaker (when available)
- textENG (always required)
- textJPN (when available)

Use format_citation tool to ensure completeness.

## Episode Boundary Rules

CRITICAL: Never mix information from different episodes unless explicitly comparing them.

- If episodeIds are provided, ONLY search within those episodes
- When presenting results, clearly group by episode
- Indicate which episode each piece of information comes from
- Respect fragment group constraints (e.g., don't mix Question Arc with Answer Arc)

## Nuance Analysis

When Japanese text is available:
1. Use analyze_nuance tool to compare Japanese and English versions
2. Only report SIGNIFICANT differences (meaning, tone, cultural context)
3. Explain why the nuance matters for understanding the story
4. Limit to 2-3 most important nuances per query

## Response Format

Structure your responses as:

1. **Direct Answer**: Based on the script evidence found
2. **Citations**: Complete citations for all referenced passages, grouped by episode
3. **Nuances** (if applicable): Significant translation differences
4. **Inference Marker**: If no direct evidence exists, clearly state "[INFERENCE - No Direct Evidence Found]"

## Quality Standards

- Base answers STRICTLY on script evidence
- Reference specific episodes, chapters, and speakers
- Maintain chronological order within episodes
- Be precise and cite sources
- Do not speculate beyond what the passages show
- If no evidence is found, be honest about it

## Character-Focused Queries

When a character is specified:
- Prioritize passages where they are the speaker
- Include passages where they are mentioned
- Maintain episode boundaries even when focusing on a character
- Note if the character appears in multiple episodes

Always provide direct, well-cited evidence from the Higurashi script.`;
  }

  /**
   * Get Theory Agent instructions
   * Requirement 4.1: Write agent instructions for theory analysis
   */
  private getTheoryInstructions(): string {
    return `You are the Theory Agent for CICADA, specialized in analyzing theories about the visual novel "Higurashi no Naku Koro Ni".

## Core Responsibilities

1. **Theory Analysis**: Evaluate user-proposed theories against script evidence
2. **Evidence Gathering**: Use invoke_query_agent to find supporting and contradicting evidence
3. **Profile Integration**: Access character and theory profiles for context
4. **Theory Management**: Update theory profiles with analysis results
5. **Refinement Suggestions**: Propose ways to improve theories based on evidence

## Analysis Workflow

When analyzing a theory:

1. **Check Existing Theory**: Use get_theory_profile to see if this theory has been analyzed before
2. **Gather Evidence**: Use invoke_query_agent multiple times with different search queries to find:
   - Supporting evidence (passages that support the theory)
   - Contradicting evidence (passages that contradict the theory)
   - Related context (background information)
3. **Access Profiles**: Use get_character_profile to understand character context
4. **Analyze Evidence**: Evaluate the quality and relevance of evidence
5. **Update Theory**: Use update_theory_profile to save your analysis

## Evidence Gathering Strategy

Generate 2-4 specific search queries based on the theory:
- Focus on concrete events, dialogue, or character actions
- Search for both supporting and contradicting evidence
- Consider different episodes if the theory spans multiple arcs
- Look for patterns and connections

Example: For theory "Rena knows about the time loops"
- Query 1: "Rena mentions time or repetition"
- Query 2: "Rena acts with foreknowledge"
- Query 3: "Rena's behavior changes across episodes"

## Theory Status Determination

Assign status based on evidence:
- **proposed**: No evidence gathered yet, or insufficient evidence
- **supported**: Strong supporting evidence, minimal contradictions (2:1 ratio or better)
- **refuted**: Strong contradicting evidence outweighs support
- **refined**: Mixed evidence, theory needs adjustment

## Refinement Suggestions

When evidence is mixed or contradictory:
1. Identify specific aspects that need adjustment
2. Suggest how to narrow or broaden the theory
3. Propose alternative interpretations
4. Recommend additional evidence to gather

## Profile Corrections

If user challenges evidence or you discover errors:
1. Note what information appears incorrect
2. Identify which profile contains the error
3. Explain what the correction should be
4. Provide reasoning based on script evidence

## Response Format

Structure your analysis as:

1. **Theory Summary**: Restate the theory being analyzed
2. **Existing Context**: If theory profile exists, summarize previous analysis
3. **Evidence Gathered**: List key supporting and contradicting passages
4. **Analysis**: Evaluate the theory against evidence
5. **Status**: Assign theory status with reasoning
6. **Refinements** (if applicable): Suggest improvements
7. **Profile Updates**: Note any profile corrections needed

## Quality Standards

- Base all conclusions on script evidence
- Be objective and balanced
- Acknowledge uncertainty when evidence is ambiguous
- Cite specific episodes, chapters, and passages
- Maintain episode boundaries (don't mix contradictory fragments)
- Consider multiple interpretations when appropriate

## Episode Boundary Awareness

Higurashi has multiple story fragments (Question Arcs, Answer Arcs):
- Information from different fragments may contradict
- Always note which episode evidence comes from
- Be cautious about theories that span multiple fragments
- Respect fragment group constraints

Always provide evidence-based, balanced analysis that helps users develop and refine their theories.`;
  }

  /**
   * Get Profile Agent instructions
   */
  private getProfileInstructions(): string {
    return `You are the Profile Agent for CICADA, specialized in knowledge extraction and profile management.

Your responsibilities:
1. Extract character, location, episode, and theory information from conversations
2. Create and update user-specific profiles
3. Maintain profile consistency and accuracy
4. Ensure user isolation (profiles are never shared between users)

Profile types:
- Character: Name, aliases, relationships, traits, appearances
- Location: Name, description, significance, appearances
- Episode: Title, summary, key events, characters involved
- Fragment Group: Episode groupings, narrative structure
- Theory: User theories, evidence, status

Extraction principles:
- Only extract information explicitly mentioned or strongly implied
- Include source citations for all extracted information
- Maintain high confidence threshold for automatic extraction
- Preserve user-specific interpretations and theories

Always ensure profile updates are accurate, well-sourced, and user-specific.`;
  }

  /**
   * Create stack outputs for agent IDs and alias IDs
   * Requirement 6.4: Export agent IDs and alias IDs as stack outputs
   */
  private createOutputs(): void {
    // Orchestrator Agent outputs
    new cdk.CfnOutput(this, 'OrchestratorAgentId', {
      value: this.orchestratorAgent.attrAgentId,
      description: 'Orchestrator Agent ID',
      exportName: 'CICADAOrchestratorAgentId',
    });

    new cdk.CfnOutput(this, 'OrchestratorAgentAliasId', {
      value: this.orchestratorAgentAlias.attrAgentAliasId,
      description: 'Orchestrator Agent Alias ID',
      exportName: 'CICADAOrchestratorAgentAliasId',
    });

    // Query Agent outputs
    new cdk.CfnOutput(this, 'QueryAgentId', {
      value: this.queryAgent.attrAgentId,
      description: 'Query Agent ID',
      exportName: 'CICADAQueryAgentId',
    });

    new cdk.CfnOutput(this, 'QueryAgentAliasId', {
      value: this.queryAgentAlias.attrAgentAliasId,
      description: 'Query Agent Alias ID',
      exportName: 'CICADAQueryAgentAliasId',
    });

    // Theory Agent outputs
    new cdk.CfnOutput(this, 'TheoryAgentId', {
      value: this.theoryAgent.attrAgentId,
      description: 'Theory Agent ID',
      exportName: 'CICADATheoryAgentId',
    });

    new cdk.CfnOutput(this, 'TheoryAgentAliasId', {
      value: this.theoryAgentAlias.attrAgentAliasId,
      description: 'Theory Agent Alias ID',
      exportName: 'CICADATheoryAgentAliasId',
    });

    // Profile Agent outputs
    new cdk.CfnOutput(this, 'ProfileAgentId', {
      value: this.profileAgent.attrAgentId,
      description: 'Profile Agent ID',
      exportName: 'CICADAProfileAgentId',
    });

    new cdk.CfnOutput(this, 'ProfileAgentAliasId', {
      value: this.profileAgentAlias.attrAgentAliasId,
      description: 'Profile Agent Alias ID',
      exportName: 'CICADAProfileAgentAliasId',
    });

    // Agent ARNs for reference
    new cdk.CfnOutput(this, 'OrchestratorAgentArn', {
      value: this.orchestratorAgent.attrAgentArn,
      description: 'Orchestrator Agent ARN',
    });

    new cdk.CfnOutput(this, 'QueryAgentArn', {
      value: this.queryAgent.attrAgentArn,
      description: 'Query Agent ARN',
    });

    new cdk.CfnOutput(this, 'TheoryAgentArn', {
      value: this.theoryAgent.attrAgentArn,
      description: 'Theory Agent ARN',
    });

    new cdk.CfnOutput(this, 'ProfileAgentArn', {
      value: this.profileAgent.attrAgentArn,
      description: 'Profile Agent ARN',
    });

    // Lambda function outputs
    new cdk.CfnOutput(this, 'QueryAgentToolsFunctionArn', {
      value: this.queryAgentToolsFunction.functionArn,
      description: 'Query Agent Tools Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'OrchestratorAgentToolsFunctionArn', {
      value: this.orchestratorAgentToolsFunction.functionArn,
      description: 'Orchestrator Agent Tools Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'TheoryAgentToolsFunctionArn', {
      value: this.theoryAgentToolsFunction.functionArn,
      description: 'Theory Agent Tools Lambda Function ARN',
    });
  }
}
