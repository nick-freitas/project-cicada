import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
export interface ComputeStackProps extends cdk.StackProps {
    dataStack: DataStack;
}
export declare class ComputeStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ComputeStackProps);
}
