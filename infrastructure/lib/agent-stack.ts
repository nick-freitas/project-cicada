import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { ComputeStack } from './compute-stack';

export interface AgentStackProps extends cdk.StackProps {
  dataStack: DataStack;
  computeStack: ComputeStack;
}

export class AgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    // AgentCore agents will be added in future tasks
  }
}
