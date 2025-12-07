import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { APIStack } from './api-stack';
import { AuthStack } from './auth-stack';

export interface FrontendStackProps extends cdk.StackProps {
  apiStack: APIStack;
  authStack: AuthStack;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 + CloudFront will be added in future tasks
  }
}
