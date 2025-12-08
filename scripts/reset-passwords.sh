#!/bin/bash

# Reset Cognito User Passwords
# This script resets passwords for all CICADA users to a known temporary password

set -e

# Load environment variables from .env.nonprod
if [ -f .env.nonprod ]; then
  export $(cat .env.nonprod | grep -v '^#' | grep -v '^$' | xargs)
fi

# Configuration
USER_POOL_ID="${USER_POOL_ID:-us-east-1_5aZxy0xjl}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PASSWORD="${TEMP_PASSWORD:-Test12345}"

echo "Resetting passwords for CICADA users..."
echo "User Pool: $USER_POOL_ID"
echo "Region: $AWS_REGION"
echo "Password: $PASSWORD"
echo ""

# Reset admin password
echo "Resetting password for user: admin"
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username admin \
  --password "$PASSWORD" \
  --permanent \
  --region "$AWS_REGION"

# Reset nick password
echo "Resetting password for user: nick"
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username nick \
  --password "$PASSWORD" \
  --permanent \
  --region "$AWS_REGION"

# Reset naizak password
echo "Resetting password for user: naizak"
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username naizak \
  --password "$PASSWORD" \
  --permanent \
  --region "$AWS_REGION"

echo ""
echo "✅ All passwords reset successfully!"
echo "Users can now log in with password: $PASSWORD"
