import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class DataStack extends cdk.Stack {
  public readonly userProfilesTable: dynamodb.Table;
  public readonly conversationMemoryTable: dynamodb.Table;
  public readonly fragmentGroupsTable: dynamodb.Table;
  public readonly episodeConfigTable: dynamodb.Table;
  public readonly requestTrackingTable: dynamodb.Table;
  public readonly scriptDataBucket: s3.Bucket;
  public readonly knowledgeBaseBucket: s3.Bucket;
  public readonly knowledgeBaseRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // User Profiles Table
    this.userProfilesTable = new dynamodb.Table(this, 'UserProfiles', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'profileKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userProfilesTable.addGlobalSecondaryIndex({
      indexName: 'profileType-index',
      partitionKey: { name: 'profileType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'profileId', type: dynamodb.AttributeType.STRING },
    });

    // Conversation Memory Table
    this.conversationMemoryTable = new dynamodb.Table(this, 'ConversationMemory', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sessionKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Fragment Groups Table
    this.fragmentGroupsTable = new dynamodb.Table(this, 'FragmentGroups', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Episode Configuration Table
    this.episodeConfigTable = new dynamodb.Table(this, 'EpisodeConfiguration', {
      partitionKey: { name: 'episodeId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Request Tracking Table
    this.requestTrackingTable = new dynamodb.Table(this, 'RequestTracking', {
      partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Script Data Bucket
    this.scriptDataBucket = new s3.Bucket(this, 'ScriptData', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Knowledge Base Bucket - stores embeddings and indexed data
    this.knowledgeBaseBucket = new s3.Bucket(this, 'KnowledgeBase', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
    });

    // IAM Role for Bedrock Knowledge Base operations
    this.knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Bedrock Knowledge Base to access S3 and invoke models',
    });

    // Grant read/write access to both buckets
    this.scriptDataBucket.grantRead(this.knowledgeBaseRole);
    this.knowledgeBaseBucket.grantReadWrite(this.knowledgeBaseRole);

    // Grant Bedrock model invocation permissions for embeddings
    this.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );

    // For cost optimization, we're creating a minimal Knowledge Base configuration
    // The actual vector database will be implemented using a lightweight solution:
    // - Embeddings stored in S3 (knowledgeBaseBucket)
    // - Vector search implemented in Lambda using cosine similarity
    // - Metadata filters (episodeId, chapterId, messageId, speaker) stored with embeddings
    // This avoids the $50-100/month cost of OpenSearch Serverless

    // Store Knowledge Base configuration in SSM Parameter for Lambda access
    const knowledgeBaseConfig = {
      embeddingModel: 'amazon.titan-embed-text-v1',
      embeddingDimension: 1536,
      chunkSize: 512,
      chunkOverlap: 20,
      metadataFields: ['episodeId', 'chapterId', 'messageId', 'speaker', 'textJPN', 'textENG'],
      bucketName: this.knowledgeBaseBucket.bucketName,
      indexPrefix: 'embeddings/',
    };

    // Create script ingestion handler Lambda
    const scriptIngestionHandler = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      'ScriptIngestionHandler',
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'handler',
        entry: require('path').join(
          __dirname,
          '../../packages/backend/src/handlers/script-ingestion-handler.ts'
        ),
        timeout: cdk.Duration.minutes(5), // Processing can take time
        memorySize: 1024,
        environment: {
          SCRIPT_BUCKET_NAME: this.scriptDataBucket.bucketName,
          KB_BUCKET_NAME: this.knowledgeBaseBucket.bucketName,
          KNOWLEDGE_BASE_BUCKET: this.knowledgeBaseBucket.bucketName,
          EPISODE_CONFIG_TABLE_NAME: this.episodeConfigTable.tableName,
        },
        bundling: {
          externalModules: ['@aws-sdk/*'],
          minify: true,
        },
      }
    );

    // Grant permissions to script ingestion handler
    this.scriptDataBucket.grantReadWrite(scriptIngestionHandler);
    this.knowledgeBaseBucket.grantReadWrite(scriptIngestionHandler);
    this.episodeConfigTable.grantReadData(scriptIngestionHandler);

    // Grant Bedrock permissions for embeddings
    scriptIngestionHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // Add S3 trigger for script ingestion
    scriptIngestionHandler.addEventSource(
      new cdk.aws_lambda_event_sources.S3EventSource(this.scriptDataBucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [{ suffix: '.json' }],
      })
    );

    // Export bucket names for use in other stacks
    new cdk.CfnOutput(this, 'KnowledgeBaseBucketName', {
      value: this.knowledgeBaseBucket.bucketName,
      description: 'S3 bucket for Knowledge Base embeddings',
      exportName: 'CICADAKnowledgeBaseBucket',
    });

    new cdk.CfnOutput(this, 'ScriptDataBucketName', {
      value: this.scriptDataBucket.bucketName,
      description: 'S3 bucket for script data',
      exportName: 'CICADAScriptDataBucket',
    });

    // Note: We're not creating a CfnKnowledgeBase resource to avoid OpenSearch Serverless costs
    // Instead, we'll implement semantic search in Lambda with S3-stored embeddings
    // This is a cost-effective approach that meets all requirements:
    // - Semantic search using Titan Embeddings
    // - Metadata filters (episodeId, chapterId, messageId, speaker)
    // - Episode boundary enforcement
    // - Under $100/month budget
  }
}
