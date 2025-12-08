import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { AgentStack } from './agent-stack';
import * as path from 'path';

export interface APIStackProps extends cdk.StackProps {


  dataStack: DataStack;
  agentStack: AgentStack;
  authStack?: any; // Will be properly typed when AuthStack is imported
}

export class APIStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly messageQueue: sqs.Queue;
  public readonly agentOrchestrationStateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: APIStackProps) {
    super(scope, id, props);

    // Create DynamoDB table for WebSocket connections
    const connectionsTable = new dynamodb.Table(this, 'WebSocketConnections', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Create SQS queue for message processing
    this.messageQueue = new sqs.Queue(this, 'MessageQueue', {
      visibilityTimeout: cdk.Duration.seconds(300), // 5 minutes for agent processing
      retentionPeriod: cdk.Duration.days(1),
    });

    // Create WebSocket handler Lambda
    const webSocketHandler = new lambdaNodejs.NodejsFunction(this, 'WebSocketHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/websocket/handler.ts'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        REQUEST_TRACKING_TABLE: props.dataStack.requestTrackingTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
        MESSAGE_QUEUE_URL: this.messageQueue.queueUrl,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
    });

    // Grant permissions to WebSocket handler
    props.dataStack.requestTrackingTable.grantReadWriteData(webSocketHandler);
    connectionsTable.grantReadWriteData(webSocketHandler);
    this.messageQueue.grantSendMessages(webSocketHandler);

    // Create WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketAPI', {
      apiName: 'CICADA-WebSocket',
      description: 'WebSocket API for CICADA agent streaming',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          webSocketHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          webSocketHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          webSocketHandler
        ),
      },
    });

    // Add custom routes
    this.webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
        'SendMessageIntegration',
        webSocketHandler
      ),
    });

    this.webSocketApi.addRoute('resume', {
      integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
        'ResumeIntegration',
        webSocketHandler
      ),
    });

    // Create WebSocket stage
    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant WebSocket handler permission to post to connections
    webSocketHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.webSocketStage.stageName}/POST/@connections/*`,
        ],
      })
    );

    // Create message processor Lambda
    const messageProcessor = new lambdaNodejs.NodejsFunction(this, 'MessageProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/websocket/message-processor.ts'),
      timeout: cdk.Duration.seconds(300), // 5 minutes for agent processing
      memorySize: 1024,
      environment: {
        REQUEST_TRACKING_TABLE: props.dataStack.requestTrackingTable.tableName,
        USER_PROFILES_TABLE: props.dataStack.userProfilesTable.tableName,
        CONVERSATION_MEMORY_TABLE: props.dataStack.conversationMemoryTable.tableName,
        FRAGMENT_GROUPS_TABLE: props.dataStack.fragmentGroupsTable.tableName,
        EPISODE_CONFIG_TABLE: props.dataStack.episodeConfigTable.tableName,
        KNOWLEDGE_BASE_BUCKET: props.dataStack.knowledgeBaseBucket.bucketName,
        WEBSOCKET_DOMAIN_NAME: `${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com`,
        WEBSOCKET_STAGE: this.webSocketStage.stageName,
        // AgentCore agent IDs for invocation
        ORCHESTRATOR_AGENT_ID: props.agentStack.orchestratorAgent.attrAgentId,
        ORCHESTRATOR_AGENT_ALIAS_ID: props.agentStack.orchestratorAgentAlias.attrAgentAliasId,
        QUERY_AGENT_ID: props.agentStack.queryAgent.attrAgentId,
        QUERY_AGENT_ALIAS_ID: props.agentStack.queryAgentAlias.attrAgentAliasId,
        THEORY_AGENT_ID: props.agentStack.theoryAgent.attrAgentId,
        THEORY_AGENT_ALIAS_ID: props.agentStack.theoryAgentAlias.attrAgentAliasId,
        PROFILE_AGENT_ID: props.agentStack.profileAgent.attrAgentId,
        PROFILE_AGENT_ALIAS_ID: props.agentStack.profileAgentAlias.attrAgentAliasId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
    });

    // Grant permissions to message processor
    props.dataStack.requestTrackingTable.grantReadWriteData(messageProcessor);
    props.dataStack.userProfilesTable.grantReadWriteData(messageProcessor);
    props.dataStack.conversationMemoryTable.grantReadWriteData(messageProcessor);
    props.dataStack.fragmentGroupsTable.grantReadWriteData(messageProcessor);
    props.dataStack.episodeConfigTable.grantReadData(messageProcessor);
    props.dataStack.knowledgeBaseBucket.grantRead(messageProcessor);
    connectionsTable.grantReadWriteData(messageProcessor);

    // Grant Bedrock permissions
    messageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );

    // Grant permission to invoke AgentCore agents
    messageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:agent/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/*`,
        ],
      })
    );

    // Grant permission to post to WebSocket connections
    messageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.webSocketStage.stageName}/POST/@connections/*`,
        ],
      })
    );

    // Create Step Functions state machine for agent orchestration
    const orchestratorTask = new tasks.LambdaInvoke(this, 'InvokeOrchestrator', {
      lambdaFunction: messageProcessor,
      payload: sfn.TaskInput.fromObject({
        'requestId.$': '$.requestId',
        'userId.$': '$.userId',
        'connectionId.$': '$.connectionId',
        'query.$': '$.query',
      }),
      resultPath: '$.orchestratorResult',
    });

    // Add error handling with retry logic
    orchestratorTask.addRetry({
      errors: ['States.TaskFailed', 'States.Timeout'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Add catch for failures
    const failureState = new sfn.Fail(this, 'AgentProcessingFailed', {
      cause: 'Agent processing failed after retries',
      error: 'AgentError',
    });

    orchestratorTask.addCatch(failureState, {
      resultPath: '$.error',
    });

    // Create the state machine
    this.agentOrchestrationStateMachine = new sfn.StateMachine(this, 'AgentOrchestration', {
      stateMachineName: 'CICADA-Agent-Orchestration',
      definition: orchestratorTask,
      timeout: cdk.Duration.minutes(5),
    });

    // Create EventBridge rule to trigger Step Functions from SQS
    const sqsToStepFunctionsRule = new events.Rule(this, 'SQSToStepFunctions', {
      eventPattern: {
        source: ['aws.sqs'],
        detailType: ['SQS Message'],
      },
    });

    sqsToStepFunctionsRule.addTarget(
      new eventsTargets.SfnStateMachine(this.agentOrchestrationStateMachine)
    );

    // Alternative: Keep direct SQS trigger for simpler processing
    // Add SQS trigger to message processor
    messageProcessor.addEventSource(
      new lambdaEventSources.SqsEventSource(this.messageQueue, {
        batchSize: 1, // Process one message at a time for streaming
      })
    );

    // Create REST API for profile management
    const restApi = new cdk.aws_apigateway.RestApi(this, 'ProfileAPI', {
      restApiName: 'CICADA-Profile-API',
      description: 'REST API for CICADA profile management',
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Create profile handler Lambda
    const profileHandler = new lambdaNodejs.NodejsFunction(this, 'ProfileHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../packages/backend/src/handlers/rest-api/profile-handler.ts'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        USER_PROFILES_TABLE: props.dataStack.userProfilesTable.tableName,
        USER_POOL_ID: props.authStack?.userPool?.userPoolId || '',
        USER_POOL_CLIENT_ID: props.authStack?.userPoolClient?.userPoolClientId || '',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
    });

    // Grant permissions to profile handler
    props.dataStack.userProfilesTable.grantReadWriteData(profileHandler);

    // Create API Gateway integration
    const profileIntegration = new cdk.aws_apigateway.LambdaIntegration(profileHandler);

    // Add routes
    const profiles = restApi.root.addResource('profiles');
    profiles.addMethod('GET', profileIntegration); // List all profiles
    profiles.addMethod('POST', profileIntegration); // Create profile (with type in body)

    const profileType = profiles.addResource('{profileType}');
    profileType.addMethod('GET', profileIntegration); // List profiles by type
    profileType.addMethod('POST', profileIntegration); // Create profile of type

    const profileId = profileType.addResource('{profileId}');
    profileId.addMethod('GET', profileIntegration); // Get specific profile
    profileId.addMethod('PUT', profileIntegration); // Update profile
    profileId.addMethod('DELETE', profileIntegration); // Delete profile

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: this.webSocketStage.url,
      description: 'WebSocket API URL',
      exportName: 'CICADAWebSocketURL',
    });

    new cdk.CfnOutput(this, 'WebSocketAPIId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
    });

    new cdk.CfnOutput(this, 'RestAPIURL', {
      value: restApi.url,
      description: 'REST API URL',
      exportName: 'CICADARestAPIURL',
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.agentOrchestrationStateMachine.stateMachineArn,
      description: 'Agent Orchestration State Machine ARN',
      exportName: 'CICADAStateMachineArn',
    });
  }
}
