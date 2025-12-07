import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class DataStack extends cdk.Stack {
  public readonly userProfilesTable: dynamodb.Table;
  public readonly conversationMemoryTable: dynamodb.Table;
  public readonly fragmentGroupsTable: dynamodb.Table;
  public readonly episodeConfigTable: dynamodb.Table;
  public readonly requestTrackingTable: dynamodb.Table;
  public readonly scriptDataBucket: s3.Bucket;
  public readonly knowledgeBaseBucket: s3.Bucket;

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

    // Knowledge Base Bucket
    this.knowledgeBaseBucket = new s3.Bucket(this, 'KnowledgeBase', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });
  }
}
