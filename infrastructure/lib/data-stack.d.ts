import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
export declare class DataStack extends cdk.Stack {
    readonly userProfilesTable: dynamodb.Table;
    readonly conversationMemoryTable: dynamodb.Table;
    readonly fragmentGroupsTable: dynamodb.Table;
    readonly episodeConfigTable: dynamodb.Table;
    readonly requestTrackingTable: dynamodb.Table;
    readonly scriptDataBucket: s3.Bucket;
    readonly knowledgeBaseBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
