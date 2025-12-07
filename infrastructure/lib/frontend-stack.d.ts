import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { APIStack } from './api-stack';
import { AuthStack } from './auth-stack';
export interface FrontendStackProps extends cdk.StackProps {
    apiStack: APIStack;
    authStack: AuthStack;
}
export declare class FrontendStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: FrontendStackProps);
}
