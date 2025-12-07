import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ComputeStack } from './compute-stack';
import { AgentStack } from './agent-stack';
export interface APIStackProps extends cdk.StackProps {
    computeStack: ComputeStack;
    agentStack: AgentStack;
}
export declare class APIStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: APIStackProps);
}
