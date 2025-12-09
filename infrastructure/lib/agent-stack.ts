import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import * as path from 'path';

export interface AgentStackProps extends cdk.StackProps {
  dataStack: DataStack;
  authStack?: any; // Will be properly typed when AuthStack is imported
}

/**
 * AgentStack - Defines AWS AgentCore agents for CICADA multi-agent system
 * 
 * This stack creates Lambda functions for AgentCore agents:
 * - Gateway: Entry point for all agent requests
 * - Orchestrator: Central coordinator that routes queries to specialized agents
 * - Query: Script search and citation specialist
 * - Theory: Theory analysis and validation specialist
 * - Profile: Knowledge extraction and profile management specialist
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 * 
 * Note: This stack has been migrated from Bedrock Agents (managed service) to
 * AgentCore (framework/SDK) to achieve deterministic tool invocation.
 * 
 * Task 13: Removed all Bedrock Agent constructs (CfnAgent, CfnAgentAlias)
 * Task 14: Added AgentCore Lambda functions
 */
export class AgentStack extends cdk.Stack {
  // AgentCore Lambda functions
  public readonly gatewayFunction: lambdaNodejs.NodejsFunction;
  public readonly orchestratorFunction: lambdaNodejs.NodejsFunction;
  public readonly queryFunction: lambdaNodejs.NodejsFunction;
  public readonly theoryFunction: lambdaNodejs.NodejsFunction;
  public readonly profileFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    const { dataStack } = props;

    // Default model ID for all agents
    const modelId = process.env.MODEL_ID || 'amazon.nova-pro-v1:0';

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(300), // 5 minutes for agent processing
      memorySize: 1024, // 1GB for agent operations
      bundling: {
        externalModules: ['@aws-sdk/*'], // Use AWS SDK from Lambda runtime
        minify: true,
        sourceMap: true,
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        MODEL_ID: modelId,
      },
    };

    // ========================================
    // Query Agent Lambda
    // ========================================
    this.queryFunction = new lambdaNodejs.NodejsFunction(this, 'QueryAgentFunction', {
      ...commonLambdaProps,
      functionName: `${this.stackName}-QueryAgent`,
      description: 'Query Agent - Script search and citation specialist',
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agentcore/query-handler.ts'),
      environment: {
        ...commonLambdaProps.environment,
        KNOWLEDGE_BASE_BUCKET: dataStack.knowledgeBaseBucket.bucketName,
        SCRIPT_DATA_BUCKET: dataStack.scriptDataBucket.bucketName,
        EPISODE_CONFIG_TABLE: dataStack.episodeConfigTable.tableName,
        MAX_EMBEDDINGS_TO_LOAD: '3000',
      },
    });

    // Grant Query Agent permissions
    // S3 access for knowledge base and script data
    dataStack.knowledgeBaseBucket.grantRead(this.queryFunction);
    dataStack.scriptDataBucket.grantRead(this.queryFunction);
    
    // DynamoDB access for episode configuration (metadata filtering)
    dataStack.episodeConfigTable.grantReadData(this.queryFunction);

    // Grant Bedrock model invocation
    this.queryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'], // Bedrock models don't have specific ARNs
      })
    );
    
    // CloudWatch Logs permissions (explicit for clarity)
    this.queryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${this.stackName}-QueryAgent:*`],
      })
    );

    // ========================================
    // Theory Agent Lambda
    // ========================================
    this.theoryFunction = new lambdaNodejs.NodejsFunction(this, 'TheoryAgentFunction', {
      ...commonLambdaProps,
      functionName: `${this.stackName}-TheoryAgent`,
      description: 'Theory Agent - Theory analysis and validation specialist',
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agentcore/theory-handler.ts'),
      environment: {
        ...commonLambdaProps.environment,
        QUERY_FUNCTION_ARN: this.queryFunction.functionArn,
        USER_PROFILES_TABLE: dataStack.userProfilesTable.tableName,
        CONVERSATION_MEMORY_TABLE: dataStack.conversationMemoryTable.tableName,
      },
    });

    // Grant Theory Agent permissions
    // DynamoDB access for profiles and conversation memory
    dataStack.userProfilesTable.grantReadWriteData(this.theoryFunction);
    dataStack.conversationMemoryTable.grantReadData(this.theoryFunction);
    
    // Lambda invoke permissions for sub-agents
    this.queryFunction.grantInvoke(this.theoryFunction);

    // Grant Bedrock model invocation
    this.theoryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );
    
    // CloudWatch Logs permissions (explicit for clarity)
    this.theoryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${this.stackName}-TheoryAgent:*`],
      })
    );

    // ========================================
    // Profile Agent Lambda
    // ========================================
    this.profileFunction = new lambdaNodejs.NodejsFunction(this, 'ProfileAgentFunction', {
      ...commonLambdaProps,
      functionName: `${this.stackName}-ProfileAgent`,
      description: 'Profile Agent - Profile management specialist',
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agentcore/profile-handler.ts'),
      environment: {
        ...commonLambdaProps.environment,
        USER_PROFILES_TABLE: dataStack.userProfilesTable.tableName,
        FRAGMENT_GROUPS_TABLE: dataStack.fragmentGroupsTable.tableName,
        EPISODE_CONFIG_TABLE: dataStack.episodeConfigTable.tableName,
      },
    });

    // Grant Profile Agent permissions
    // DynamoDB access for profiles, fragment groups, and episode config
    dataStack.userProfilesTable.grantReadWriteData(this.profileFunction);
    dataStack.fragmentGroupsTable.grantReadWriteData(this.profileFunction);
    dataStack.episodeConfigTable.grantReadData(this.profileFunction);

    // Grant Bedrock model invocation
    this.profileFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );
    
    // CloudWatch Logs permissions (explicit for clarity)
    this.profileFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${this.stackName}-ProfileAgent:*`],
      })
    );

    // ========================================
    // Orchestrator Agent Lambda
    // ========================================
    this.orchestratorFunction = new lambdaNodejs.NodejsFunction(this, 'OrchestratorFunction', {
      ...commonLambdaProps,
      functionName: `${this.stackName}-Orchestrator`,
      description: 'Orchestrator Agent - Central coordinator for multi-agent system',
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agentcore/orchestrator-handler.ts'),
      memorySize: 512, // Orchestrator needs less memory (no heavy processing)
      environment: {
        ...commonLambdaProps.environment,
        QUERY_FUNCTION_ARN: this.queryFunction.functionArn,
        THEORY_FUNCTION_ARN: this.theoryFunction.functionArn,
        PROFILE_FUNCTION_ARN: this.profileFunction.functionArn,
        CONVERSATION_MEMORY_TABLE: dataStack.conversationMemoryTable.tableName,
        // Orchestrator runs agents in-process, so needs their environment variables
        KNOWLEDGE_BASE_BUCKET: dataStack.knowledgeBaseBucket.bucketName,
        SCRIPT_DATA_BUCKET: dataStack.scriptDataBucket.bucketName,
        USER_PROFILES_TABLE: dataStack.userProfilesTable.tableName,
        FRAGMENT_GROUPS_TABLE: dataStack.fragmentGroupsTable.tableName,
        EPISODE_CONFIG_TABLE: dataStack.episodeConfigTable.tableName,
        MAX_EMBEDDINGS_TO_LOAD: '3000',
      },
    });

    // Grant Orchestrator permissions
    // Lambda invoke permissions for all specialized agents
    this.queryFunction.grantInvoke(this.orchestratorFunction);
    this.theoryFunction.grantInvoke(this.orchestratorFunction);
    this.profileFunction.grantInvoke(this.orchestratorFunction);
    
    // DynamoDB access for conversation memory (context passing)
    dataStack.conversationMemoryTable.grantReadData(this.orchestratorFunction);
    
    // Orchestrator runs agents in-process, so needs access to all their resources
    // S3 access for knowledge base and script data (for Query Agent)
    dataStack.knowledgeBaseBucket.grantRead(this.orchestratorFunction);
    dataStack.scriptDataBucket.grantRead(this.orchestratorFunction);
    
    // DynamoDB access for profiles, fragments, and episode config (for all agents)
    dataStack.userProfilesTable.grantReadWriteData(this.orchestratorFunction);
    dataStack.fragmentGroupsTable.grantReadWriteData(this.orchestratorFunction);
    dataStack.episodeConfigTable.grantReadData(this.orchestratorFunction);

    // Grant Bedrock model invocation (for classification if needed)
    this.orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );
    
    // CloudWatch Logs permissions (explicit for clarity)
    this.orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${this.stackName}-Orchestrator:*`],
      })
    );

    // ========================================
    // Gateway Lambda
    // ========================================
    this.gatewayFunction = new lambdaNodejs.NodejsFunction(this, 'GatewayFunction', {
      ...commonLambdaProps,
      functionName: `${this.stackName}-Gateway`,
      description: 'Gateway - Entry point for all AgentCore requests',
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/agentcore/gateway-handler.ts'),
      memorySize: 512, // Gateway needs less memory (routing only)
      environment: {
        ...commonLambdaProps.environment,
        ORCHESTRATOR_FUNCTION_ARN: this.orchestratorFunction.functionArn,
        QUERY_FUNCTION_ARN: this.queryFunction.functionArn,
        THEORY_FUNCTION_ARN: this.theoryFunction.functionArn,
        PROFILE_FUNCTION_ARN: this.profileFunction.functionArn,
        USER_PROFILES_TABLE: dataStack.userProfilesTable.tableName,
        CONVERSATION_MEMORY_TABLE: dataStack.conversationMemoryTable.tableName,
        FRAGMENT_GROUPS_TABLE: dataStack.fragmentGroupsTable.tableName,
        EPISODE_CONFIG_TABLE: dataStack.episodeConfigTable.tableName,
        KNOWLEDGE_BASE_BUCKET: dataStack.knowledgeBaseBucket.bucketName,
        // Add Cognito configuration for authentication
        USER_POOL_ID: props.authStack?.userPool?.userPoolId || '',
        USER_POOL_CLIENT_ID: props.authStack?.userPoolClient?.userPoolClientId || '',
      },
    });

    // Grant Gateway permissions
    // Lambda invoke permissions for all agents
    this.orchestratorFunction.grantInvoke(this.gatewayFunction);
    this.queryFunction.grantInvoke(this.gatewayFunction);
    this.theoryFunction.grantInvoke(this.gatewayFunction);
    this.profileFunction.grantInvoke(this.gatewayFunction);
    
    // DynamoDB access for profiles, memory, and config
    dataStack.userProfilesTable.grantReadWriteData(this.gatewayFunction);
    dataStack.conversationMemoryTable.grantReadWriteData(this.gatewayFunction);
    dataStack.fragmentGroupsTable.grantReadData(this.gatewayFunction);
    dataStack.episodeConfigTable.grantReadData(this.gatewayFunction);
    
    // S3 access for knowledge base (potential direct access)
    dataStack.knowledgeBaseBucket.grantRead(this.gatewayFunction);
    
    // Grant Bedrock model invocation (for potential direct inference)
    this.gatewayFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );
    
    // CloudWatch Logs permissions (explicit for clarity)
    this.gatewayFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${this.stackName}-Gateway:*`],
      })
    );

    // ========================================
    // CloudWatch Logs - Retention Policy
    // ========================================
    // Set log retention to 7 days for cost optimization
    const logRetention = cdk.aws_logs.RetentionDays.ONE_WEEK;

    new cdk.aws_logs.LogGroup(this, 'GatewayLogGroup', {
      logGroupName: `/aws/lambda/${this.gatewayFunction.functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.aws_logs.LogGroup(this, 'OrchestratorLogGroup', {
      logGroupName: `/aws/lambda/${this.orchestratorFunction.functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.aws_logs.LogGroup(this, 'QueryLogGroup', {
      logGroupName: `/aws/lambda/${this.queryFunction.functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.aws_logs.LogGroup(this, 'TheoryLogGroup', {
      logGroupName: `/aws/lambda/${this.theoryFunction.functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.aws_logs.LogGroup(this, 'ProfileLogGroup', {
      logGroupName: `/aws/lambda/${this.profileFunction.functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================
    // Stack Outputs
    // ========================================
    new cdk.CfnOutput(this, 'GatewayFunctionArn', {
      value: this.gatewayFunction.functionArn,
      description: 'ARN of Gateway Lambda function',
      exportName: `${this.stackName}-GatewayFunctionArn`,
    });

    new cdk.CfnOutput(this, 'OrchestratorFunctionArn', {
      value: this.orchestratorFunction.functionArn,
      description: 'ARN of Orchestrator Lambda function',
      exportName: `${this.stackName}-OrchestratorFunctionArn`,
    });

    new cdk.CfnOutput(this, 'QueryFunctionArn', {
      value: this.queryFunction.functionArn,
      description: 'ARN of Query Agent Lambda function',
      exportName: `${this.stackName}-QueryFunctionArn`,
    });

    new cdk.CfnOutput(this, 'TheoryFunctionArn', {
      value: this.theoryFunction.functionArn,
      description: 'ARN of Theory Agent Lambda function',
      exportName: `${this.stackName}-TheoryFunctionArn`,
    });

    new cdk.CfnOutput(this, 'ProfileFunctionArn', {
      value: this.profileFunction.functionArn,
      description: 'ARN of Profile Agent Lambda function',
      exportName: `${this.stackName}-ProfileFunctionArn`,
    });

    new cdk.CfnOutput(this, 'AgentStackStatus', {
      value: 'AgentCore Lambda functions deployed successfully',
      description: 'Status of AgentStack migration to AgentCore',
    });
  }
}
