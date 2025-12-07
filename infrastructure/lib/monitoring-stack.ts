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

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // CloudWatch alarms and dashboards will be added in future tasks
  }
}
