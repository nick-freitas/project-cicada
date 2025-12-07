import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { APIStack } from './api-stack';
import { AuthStack } from './auth-stack';
import * as path from 'path';

export interface FrontendStackProps extends cdk.StackProps {
  apiStack: APIStack;
  authStack: AuthStack;
  domainName?: string; // e.g., "example.com"
  frontendSubdomain?: string; // e.g., "app.example.com" or "nonprod.example.com"
}

export class FrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Create S3 bucket for frontend hosting
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: undefined, // Let CDK generate unique name
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA routing
      publicReadAccess: false, // CloudFront will access via OAI
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For nonprod
      autoDeleteObjects: true, // For nonprod
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Custom domain setup (optional)
    let certificate: acm.ICertificate | undefined;
    let domainNames: string[] | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (props.domainName && props.frontendSubdomain) {
      // Look up the hosted zone
      hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.domainName,
      });

      // Create ACM certificate in us-east-1 (required for CloudFront)
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: props.frontendSubdomain,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      domainNames = [props.frontendSubdomain];
    }

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe only (cost optimization)
      comment: 'CICADA Frontend Distribution',
      certificate: certificate,
      domainNames: domainNames,
    });

    // Create Route53 A record pointing to CloudFront (if custom domain is configured)
    if (hostedZone && props.frontendSubdomain) {
      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: props.frontendSubdomain,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    // Deploy frontend build to S3
    // Note: This will deploy the current build. Run `pnpm --filter @cicada/frontend run build` first
    const frontendPath = path.join(__dirname, '../../packages/frontend/dist');
    
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(frontendPath)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'], // Invalidate all paths on deployment
    });

    // Outputs
    new cdk.CfnOutput(this, 'FrontendURL', {
      value: props.frontendSubdomain
        ? `https://${props.frontendSubdomain}`
        : `https://${this.distribution.distributionDomainName}`,
      description: 'Frontend URL (custom domain or CloudFront)',
      exportName: 'CICADAFrontendURL',
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name for frontend',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    if (props.frontendSubdomain) {
      new cdk.CfnOutput(this, 'CustomDomain', {
        value: props.frontendSubdomain,
        description: 'Custom domain name',
      });
    }
  }
}
