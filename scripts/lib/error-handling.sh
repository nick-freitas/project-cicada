#!/bin/bash

# Error handling library
# Provides comprehensive error handling for AWS CLI operations

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_AUTH_ERROR=1
readonly EXIT_S3_ERROR=2
readonly EXIT_CLOUDWATCH_ERROR=3
readonly EXIT_INVALID_ARGS=4
readonly EXIT_USER_ABORT=5

# Check if AWS credentials are valid
# Returns: 0 if valid, 1 if invalid
check_aws_credentials() {
  local profile="$1"
  
  if [[ -z "${profile}" ]]; then
    echo "Error: check_aws_credentials requires profile argument" >&2
    return 1
  fi
  
  # Try to get caller identity to verify credentials
  local identity_output
  identity_output=$(aws sts get-caller-identity --profile "${profile}" 2>&1)
  local exit_code=$?
  
  if [[ ${exit_code} -ne 0 ]]; then
    # Parse error message to provide specific guidance
    if echo "${identity_output}" | grep -q "could not be found\|Unable to locate credentials"; then
      display_auth_error "credentials_not_found" "${profile}"
    elif echo "${identity_output}" | grep -q "ExpiredToken\|token has expired"; then
      display_auth_error "expired_token" "${profile}"
    elif echo "${identity_output}" | grep -q "InvalidClientTokenId"; then
      display_auth_error "invalid_credentials" "${profile}"
    else
      display_auth_error "unknown" "${profile}" "${identity_output}"
    fi
    return 1
  fi
  
  return 0
}

# Display authentication error with actionable guidance
# Usage: display_auth_error ERROR_TYPE PROFILE [ERROR_MESSAGE]
display_auth_error() {
  local error_type="$1"
  local profile="$2"
  local error_message="$3"
  
  echo "" >&2
  echo "╔════════════════════════════════════════════════════════════╗" >&2
  echo "║  🔐 AWS AUTHENTICATION ERROR                               ║" >&2
  echo "╚════════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
  
  case "${error_type}" in
    credentials_not_found)
      echo "Error: AWS credentials not found for profile '${profile}'" >&2
      echo "" >&2
      echo "Possible causes:" >&2
      echo "  • Profile '${profile}' is not configured" >&2
      echo "  • AWS CLI is not installed" >&2
      echo "  • No credentials file exists" >&2
      echo "" >&2
      echo "To fix this issue:" >&2
      echo "  1. Verify AWS CLI is installed: aws --version" >&2
      echo "  2. Configure the profile: aws configure --profile ${profile}" >&2
      echo "  3. Or use AWS SSO: aws sso login --profile ${profile}" >&2
      ;;
    expired_token)
      echo "Error: AWS credentials have expired for profile '${profile}'" >&2
      echo "" >&2
      echo "To fix this issue:" >&2
      echo "  1. Refresh your credentials: aws sso login --profile ${profile}" >&2
      echo "  2. Or re-run: aws configure --profile ${profile}" >&2
      ;;
    invalid_credentials)
      echo "Error: AWS credentials are invalid for profile '${profile}'" >&2
      echo "" >&2
      echo "Possible causes:" >&2
      echo "  • Access key ID is incorrect" >&2
      echo "  • Credentials have been revoked" >&2
      echo "" >&2
      echo "To fix this issue:" >&2
      echo "  1. Verify your credentials: aws configure list --profile ${profile}" >&2
      echo "  2. Reconfigure: aws configure --profile ${profile}" >&2
      ;;
    unknown)
      echo "Error: Failed to authenticate with AWS" >&2
      echo "" >&2
      if [[ -n "${error_message}" ]]; then
        echo "AWS CLI error:" >&2
        echo "${error_message}" | sed 's/^/  /' >&2
        echo "" >&2
      fi
      echo "To fix this issue:" >&2
      echo "  1. Check your AWS credentials: aws configure list --profile ${profile}" >&2
      echo "  2. Try refreshing: aws sso login --profile ${profile}" >&2
      ;;
  esac
  
  echo "" >&2
  echo "────────────────────────────────────────────────────────────" >&2
  echo "" >&2
}

# Handle S3 upload failure
# Usage: handle_s3_upload_error FILENAME ERROR_OUTPUT
# This function displays the error and exits immediately (critical failure)
handle_s3_upload_error() {
  local filename="$1"
  local error_output="$2"
  
  echo "" >&2
  echo "╔════════════════════════════════════════════════════════════╗" >&2
  echo "║  ❌ S3 UPLOAD FAILURE                                      ║" >&2
  echo "╚════════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
  echo "Failed to upload file: ${filename}" >&2
  echo "" >&2
  
  # Parse error to provide specific guidance
  if echo "${error_output}" | grep -q "NoSuchBucket"; then
    echo "Error: S3 bucket does not exist" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • Bucket name is incorrect" >&2
    echo "  • Bucket was deleted" >&2
    echo "  • Wrong AWS region" >&2
    echo "" >&2
    echo "To fix this issue:" >&2
    echo "  1. Verify the bucket name in the script configuration" >&2
    echo "  2. Check if the bucket exists: aws s3 ls s3://\${BUCKET} --profile ${PROFILE}" >&2
  elif echo "${error_output}" | grep -q "AccessDenied\|Forbidden"; then
    echo "Error: Access denied to S3 bucket" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • IAM user/role lacks s3:PutObject permission" >&2
    echo "  • Bucket policy denies access" >&2
    echo "" >&2
    echo "To fix this issue:" >&2
    echo "  1. Verify IAM permissions for s3:PutObject" >&2
    echo "  2. Check bucket policy allows your IAM principal" >&2
    echo "  3. Contact your AWS administrator" >&2
  elif echo "${error_output}" | grep -q "RequestTimeout\|Connection"; then
    echo "Error: Network connection issue" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • Network connectivity problems" >&2
    echo "  • AWS service outage" >&2
    echo "" >&2
    echo "To fix this issue:" >&2
    echo "  1. Check your internet connection" >&2
    echo "  2. Verify AWS service status: https://status.aws.amazon.com/" >&2
    echo "  3. Retry the upload" >&2
  else
    echo "AWS CLI error:" >&2
    echo "${error_output}" | sed 's/^/  /' >&2
    echo "" >&2
    echo "To fix this issue:" >&2
    echo "  1. Check the error message above for details" >&2
    echo "  2. Verify S3 bucket permissions" >&2
    echo "  3. Check AWS service status" >&2
  fi
  
  echo "" >&2
  echo "Upload process halted due to critical S3 error." >&2
  echo "────────────────────────────────────────────────────────────" >&2
  echo "" >&2
  
  exit ${EXIT_S3_ERROR}
}

# Handle CloudWatch query failure
# Usage: handle_cloudwatch_error ERROR_OUTPUT
# Returns: User decision (0=continue, 1=abort, 2=retry)
handle_cloudwatch_error() {
  local error_output="$1"
  
  echo "" >&2
  echo "╔════════════════════════════════════════════════════════════╗" >&2
  echo "║  ⚠️  CLOUDWATCH QUERY FAILURE                              ║" >&2
  echo "╚════════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
  
  # Parse error to provide specific guidance
  if echo "${error_output}" | grep -q "ResourceNotFoundException"; then
    echo "Error: Log group not found" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • Lambda function has not been invoked yet" >&2
    echo "  • Log group was deleted" >&2
    echo "  • Wrong AWS region" >&2
    echo "" >&2
    echo "Recommendation: Continue without monitoring or abort" >&2
  elif echo "${error_output}" | grep -q "AccessDenied\|Forbidden"; then
    echo "Error: Access denied to CloudWatch Logs" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • IAM user/role lacks logs:FilterLogEvents permission" >&2
    echo "  • Resource policy denies access" >&2
    echo "" >&2
    echo "Recommendation: Continue without monitoring or abort" >&2
  elif echo "${error_output}" | grep -q "ThrottlingException\|Rate exceeded"; then
    echo "Error: CloudWatch API rate limit exceeded" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • Too many API calls in short time" >&2
    echo "  • Other processes using CloudWatch API" >&2
    echo "" >&2
    echo "Recommendation: Retry after a short delay" >&2
  elif echo "${error_output}" | grep -q "RequestTimeout\|Connection"; then
    echo "Error: Network connection issue" >&2
    echo "" >&2
    echo "Possible causes:" >&2
    echo "  • Network connectivity problems" >&2
    echo "  • AWS service outage" >&2
    echo "" >&2
    echo "Recommendation: Retry or continue without monitoring" >&2
  else
    echo "AWS CLI error:" >&2
    echo "${error_output}" | sed 's/^/  /' >&2
    echo "" >&2
    echo "Recommendation: Retry or continue without monitoring" >&2
  fi
  
  echo "" >&2
  echo "────────────────────────────────────────────────────────────" >&2
  echo "" >&2
  echo "What would you like to do?" >&2
  echo "  [c] Continue without monitoring (skip log checks)" >&2
  echo "  [a] Abort upload process" >&2
  echo "  [r] Retry log check" >&2
  echo "" >&2
  
  while true; do
    read -p "Choice: " -n 1 -r choice
    echo ""
    
    case "${choice}" in
      c|C)
        echo "  ▶️  Continuing without monitoring..." >&2
        return 0
        ;;
      a|A)
        echo "  🛑 Aborting upload process..." >&2
        return 1
        ;;
      r|R)
        echo "  🔄 Retrying log check..." >&2
        return 2
        ;;
      *)
        echo "  ❌ Invalid choice. Please enter 'c', 'a', or 'r'." >&2
        echo "" >&2
        ;;
    esac
  done
}

# Gracefully degrade monitoring when it fails repeatedly
# Usage: offer_monitoring_degradation
# Returns: 0 if user wants to continue, 1 if user wants to abort
offer_monitoring_degradation() {
  echo "" >&2
  echo "╔════════════════════════════════════════════════════════════╗" >&2
  echo "║  ⚠️  MONITORING DEGRADATION                                ║" >&2
  echo "╚════════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
  echo "CloudWatch monitoring has failed multiple times." >&2
  echo "" >&2
  echo "⚠️  WARNING: Continuing without monitoring means errors in" >&2
  echo "   Lambda processing will NOT be detected. Files may fail" >&2
  echo "   silently without your knowledge." >&2
  echo "" >&2
  echo "────────────────────────────────────────────────────────────" >&2
  echo "" >&2
  echo "Do you want to continue without monitoring?" >&2
  echo "  [y] Yes, disable monitoring and continue uploads" >&2
  echo "  [n] No, abort the upload process" >&2
  echo "" >&2
  
  while true; do
    read -p "Choice: " -n 1 -r choice
    echo ""
    
    case "${choice}" in
      y|Y)
        echo "  ▶️  Monitoring disabled. Continuing with uploads..." >&2
        echo "" >&2
        return 0
        ;;
      n|N)
        echo "  🛑 Aborting upload process..." >&2
        return 1
        ;;
      *)
        echo "  ❌ Invalid choice. Please enter 'y' or 'n'." >&2
        echo "" >&2
        ;;
    esac
  done
}

# Wrap S3 upload with error handling
# Usage: safe_s3_upload LOCAL_FILE S3_URI PROFILE
# Returns: 0 on success, exits on failure
safe_s3_upload() {
  local local_file="$1"
  local s3_uri="$2"
  local profile="$3"
  
  if [[ -z "${local_file}" ]] || [[ -z "${s3_uri}" ]] || [[ -z "${profile}" ]]; then
    echo "Error: safe_s3_upload requires local_file, s3_uri, and profile arguments" >&2
    return 1
  fi
  
  # Attempt S3 upload and capture output
  local upload_output
  upload_output=$(aws s3 cp "${local_file}" "${s3_uri}" --profile "${profile}" 2>&1)
  local exit_code=$?
  
  if [[ ${exit_code} -ne 0 ]]; then
    # S3 upload failed - this is a critical error
    local filename=$(basename "${local_file}")
    handle_s3_upload_error "${filename}" "${upload_output}"
    # handle_s3_upload_error exits, so this line is never reached
  fi
  
  return 0
}
