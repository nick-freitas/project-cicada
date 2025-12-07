import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { ComputeStack } from './compute-stack';
import { APIStack } from './api-stack';
export interface MonitoringStackProps extends cdk.StackProps {
    dataStack: DataStack;
    computeStack: ComputeStack;
    apiStack: APIStack;
}
export declare class MonitoringStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MonitoringStackProps);
}
