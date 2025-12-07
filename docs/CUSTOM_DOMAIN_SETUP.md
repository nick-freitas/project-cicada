# Custom Domain Setup Guide

This guide explains how to configure a custom domain for the CICADA frontend using AWS Route53.

## Prerequisites

1. **Domain registered with AWS Route53** (or transferred to Route53)
2. **Hosted Zone created** in Route53 for your domain
3. **Domain name** (e.g., `example.com`)

## Configuration Steps

### 1. Update Environment File

Add the following variables to your environment file (`.env.nonprod` or `.env.prod`):

```bash
# Your Route53 hosted zone domain
DOMAIN_NAME=your-domain.com

# Subdomain for the frontend (can be the apex domain or a subdomain)
FRONTEND_SUBDOMAIN=app.your-domain.com
# Or for nonprod:
# FRONTEND_SUBDOMAIN=nonprod.your-domain.com
```

**Examples:**
- Apex domain: `FRONTEND_SUBDOMAIN=example.com`
- Subdomain: `FRONTEND_SUBDOMAIN=app.example.com`
- Environment-specific: `FRONTEND_SUBDOMAIN=nonprod.example.com`

### 2. Deploy the Stack

Deploy the FrontendStack with the custom domain configuration:

```bash
# For nonprod
pnpm deploy:nonprod ProjectCICADAFrontendStack --require-approval never

# For prod
pnpm deploy:prod ProjectCICADAFrontendStack --require-approval never
```

### 3. What Happens During Deployment

The CDK stack will automatically:

1. **Look up your Route53 Hosted Zone** using the `DOMAIN_NAME`
2. **Create an ACM Certificate** for your `FRONTEND_SUBDOMAIN`
   - Certificate is created in `us-east-1` (required for CloudFront)
   - DNS validation records are automatically added to Route53
3. **Configure CloudFront** with the custom domain and certificate
4. **Create a Route53 A Record** pointing to the CloudFront distribution

### 4. DNS Propagation

- **Certificate validation**: Usually takes 5-10 minutes
- **DNS propagation**: Can take up to 48 hours (typically much faster)
- **CloudFront deployment**: Takes 15-20 minutes

### 5. Verify Deployment

After deployment completes, check the CDK outputs:

```bash
# You should see:
ProjectCICADAFrontendStack.FrontendURL = https://app.your-domain.com
ProjectCICADAFrontendStack.CloudFrontURL = https://d2owq6gm68xk87.cloudfront.net
ProjectCICADAFrontendStack.CustomDomain = app.your-domain.com
```

Test your custom domain:
```bash
curl -I https://app.your-domain.com
```

## Without Custom Domain

If you don't set `DOMAIN_NAME` and `FRONTEND_SUBDOMAIN`, the stack will deploy with only the CloudFront URL:

```bash
# Just comment out or remove these from your .env file:
# DOMAIN_NAME=your-domain.com
# FRONTEND_SUBDOMAIN=app.your-domain.com
```

The frontend will be accessible at the CloudFront URL:
```
https://d2owq6gm68xk87.cloudfront.net
```

## Troubleshooting

### Certificate Validation Stuck

If certificate validation takes longer than 30 minutes:

1. Check Route53 for the validation CNAME records
2. Ensure your domain's nameservers point to Route53
3. Check CloudFormation events for errors

### Domain Not Resolving

1. Verify the A record exists in Route53:
   ```bash
   dig app.your-domain.com
   ```

2. Check CloudFront distribution status (should be "Deployed")

3. Wait for DNS propagation (can take up to 48 hours)

### Certificate in Wrong Region

ACM certificates for CloudFront **must** be in `us-east-1`. The CDK stack handles this automatically, but if you manually created a certificate, ensure it's in the correct region.

## Cost Considerations

- **Route53 Hosted Zone**: $0.50/month
- **Route53 Queries**: $0.40 per million queries
- **ACM Certificate**: Free
- **CloudFront**: Same pricing as before (custom domain doesn't add cost)

## Security Notes

- All traffic is automatically redirected to HTTPS
- ACM certificate auto-renews before expiration
- CloudFront provides DDoS protection via AWS Shield Standard (free)

## Updating the Domain

To change the custom domain:

1. Update the environment variables
2. Redeploy the stack
3. The old certificate and DNS records will be automatically cleaned up

## Removing Custom Domain

To remove the custom domain and go back to CloudFront URL only:

1. Comment out or remove `DOMAIN_NAME` and `FRONTEND_SUBDOMAIN` from `.env` file
2. Redeploy the stack
3. The certificate and DNS records will be automatically deleted
