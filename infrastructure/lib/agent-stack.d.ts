import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { ComputeStack } from './compute-stack';
export interface AgentStackProps extends cdk.StackProps {
    dataStack: DataStack;
    computeStack: ComputeStack;
}
export declare class AgentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AgentStackProps);
}
