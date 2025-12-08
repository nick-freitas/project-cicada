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

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    // Create IAM role for agent execution
    // Requirement 6.2: Define IAM roles for agent execution
    const agentRole = this.createAgentExecutionRole(props.dataStack);

    // Create Lambda function for Query Agent tools
    // Requirement 3.4: Implement tool handlers for semantic search integration
    this.queryAgentToolsFunction = this.createQueryAgentToolsFunction(props.dataStack);

    // Create agents
    // Requirement 6.1: Use CDK constructs for AgentCore agent deployment
    this.orchestratorAgent = this.createOrchestratorAgent(agentRole);
    this.queryAgent = this.createQueryAgent(agentRole, this.queryAgentToolsFunction);
    this.theoryAgent = this.createTheoryAgent(agentRole);
    this.profileAgent = this.createProfileAgent(agentRole);

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

    // Export agent IDs and alias IDs as stack outputs
    // Requirement 6.4: Export agent IDs and alias IDs as stack outputs
    this.createOutputs();
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
        AWS_REGION: this.region,
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
  private createOrchestratorAgent(role: iam.Role): bedrock.CfnAgent {
    // Requirement 2.2: Define tools for invoking Query, Theory, and Profile agents
    // Action groups define the tools available to the agent
    const actionGroups: bedrock.CfnAgent.AgentActionGroupProperty[] = [
      {
        actionGroupName: 'AgentInvocationTools',
        description: 'Tools for invoking specialized agents (Query, Theory, Profile)',
        actionGroupState: 'ENABLED',
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
        // Action group executor will be a Lambda function that handles tool invocations
        // This will be implemented in task 6 (Configure Orchestrator to invoke Query Agent)
        // For now, we define the schema so the agent knows what tools are available
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
              description: 'Format a search result as a complete citation with all required metadata (episode, chapter, message ID, speaker, text).',
              parameters: {
                episodeId: {
                  type: 'string',
                  description: 'Episode ID',
                  required: true,
                },
                episodeName: {
                  type: 'string',
                  description: 'Episode name',
                  required: true,
                },
                chapterId: {
                  type: 'string',
                  description: 'Chapter ID',
                  required: true,
                },
                messageId: {
                  type: 'number',
                  description: 'Message ID',
                  required: true,
                },
                speaker: {
                  type: 'string',
                  description: 'Speaker name (optional)',
                  required: false,
                },
                textENG: {
                  type: 'string',
                  description: 'English text',
                  required: true,
                },
                textJPN: {
                  type: 'string',
                  description: 'Japanese text (optional)',
                  required: false,
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
   */
  private createTheoryAgent(role: iam.Role): bedrock.CfnAgent {
    return new bedrock.CfnAgent(this, 'TheoryAgent', {
      agentName: 'CICADA-Theory',
      description: 'Theory analysis and validation specialist that gathers evidence and identifies profile corrections',
      foundationModel: 'amazon.nova-lite-v1:0',
      instruction: this.getTheoryInstructions(),
      agentResourceRoleArn: role.roleArn,
      idleSessionTtlInSeconds: 600,
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
   */
  private getTheoryInstructions(): string {
    return `You are the Theory Agent for CICADA, specialized in theory analysis and validation.

Your responsibilities:
1. Analyze user theories about the Higurashi narrative
2. Gather supporting and contradicting evidence via the Query Agent
3. Identify profile corrections when theories challenge existing knowledge
4. Generate theory refinement suggestions
5. Maintain evidence-based reasoning

Analysis approach:
- Gather comprehensive evidence before drawing conclusions
- Consider both supporting and contradicting evidence
- Identify gaps in current knowledge
- Suggest refinements to improve theory accuracy
- Flag profile information that may need correction

Profile correction criteria:
- Evidence directly contradicts existing profile data
- Multiple sources support the correction
- Correction is specific and actionable

Always maintain objectivity and base conclusions on script evidence.`;
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
  }
}
