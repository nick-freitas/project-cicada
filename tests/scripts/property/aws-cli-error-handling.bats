#!/usr/bin/env bats

# Property-based tests for AWS CLI error handling
# Feature: script-upload-monitoring, Property 8: AWS CLI error handling
# Validates: Requirements 5.1, 5.2, 5.3, 5.4

load '../helpers/test_helper'

setup() {
  # Source the error handling library
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh"
  
  # Set up test environment
  export PROFILE="test-profile"
  export BUCKET="test-bucket"
}

# Property 8: AWS CLI error handling
# For any AWS CLI command failure (S3 or CloudWatch), the script should capture
# the error output and display it to the user rather than silently continuing.

@test "Property 8.1: Authentication errors are captured and displayed (100 iterations)" {
  local iterations=100
  local success_count=0
  
  for ((i=0; i<iterations; i++)); do
    # Generate random authentication error types
    local error_types=("credentials_not_found" "expired_token" "invalid_credentials" "unknown")
    local random_index=$((RANDOM % ${#error_types[@]}))
    local error_type="${error_types[$random_index]}"
    
    # Mock AWS CLI to return authentication error
    aws() {
      case "$error_type" in
        credentials_not_found)
          echo "Unable to locate credentials. You can configure credentials by running \"aws configure\"." >&2
          return 255
          ;;
        expired_token)
          echo "An error occurred (ExpiredToken) when calling the GetCallerIdentity operation: The security token included in the request is expired" >&2
          return 255
          ;;
        invalid_credentials)
          echo "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid." >&2
          return 403
          ;;
        unknown)
          echo "An error occurred (UnknownError) when calling the GetCallerIdentity operation: Something went wrong" >&2
          return 1
          ;;
      esac
    }
    export -f aws
    
    # Call check_aws_credentials and capture output
    local output
    output=$(check_aws_credentials "test-profile" 2>&1)
    local exit_code=$?
    
    # Verify error was captured (non-zero exit code)
    if [[ ${exit_code} -ne 0 ]]; then
      # Verify error output contains meaningful information
      if [[ -n "${output}" ]] && [[ "${output}" != "" ]]; then
        # Verify output is displayed (not silent)
        if echo "${output}" | grep -q "Error:\|AWS\|credentials\|token\|authentication"; then
          ((success_count++))
        fi
      fi
    fi
    
    unset -f aws
  done
  
  # All iterations should successfully capture and display errors
  [[ ${success_count} -eq ${iterations} ]]
}

@test "Property 8.2: S3 upload errors are captured and cause immediate halt (100 iterations)" {
  local iterations=100
  local success_count=0
  
  for ((i=0; i<iterations; i++)); do
    # Generate random S3 error types
    local error_types=("NoSuchBucket" "AccessDenied" "RequestTimeout" "UnknownError")
    local random_index=$((RANDOM % ${#error_types[@]}))
    local error_type="${error_types[$random_index]}"
    
    # Generate random filename
    local filename="test_file_${RANDOM}.json"
    
    # Mock AWS CLI to return S3 error
    aws() {
      case "$error_type" in
        NoSuchBucket)
          echo "An error occurred (NoSuchBucket) when calling the PutObject operation: The specified bucket does not exist" >&2
          return 255
          ;;
        AccessDenied)
          echo "An error occurred (AccessDenied) when calling the PutObject operation: Access Denied" >&2
          return 254
          ;;
        RequestTimeout)
          echo "An error occurred (RequestTimeout) when calling the PutObject operation: Your socket connection to the server was not read from or written to within the timeout period." >&2
          return 1
          ;;
        UnknownError)
          echo "An error occurred (UnknownError) when calling the PutObject operation: Something went wrong" >&2
          return 1
          ;;
      esac
    }
    export -f aws
    
    # Call safe_s3_upload in a subshell (since it exits)
    local output
    output=$(
      bash -c "
        source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
        aws() {
          case '${error_type}' in
            NoSuchBucket)
              echo 'An error occurred (NoSuchBucket) when calling the PutObject operation: The specified bucket does not exist' >&2
              return 255
              ;;
            AccessDenied)
              echo 'An error occurred (AccessDenied) when calling the PutObject operation: Access Denied' >&2
              return 254
              ;;
            RequestTimeout)
              echo 'An error occurred (RequestTimeout) when calling the PutObject operation: Connection timeout' >&2
              return 1
              ;;
            UnknownError)
              echo 'An error occurred (UnknownError) when calling the PutObject operation: Something went wrong' >&2
              return 1
              ;;
          esac
        }
        export -f aws
        safe_s3_upload '/tmp/${filename}' 's3://test-bucket/${filename}' 'test-profile' 2>&1
        echo 'SHOULD_NOT_REACH_HERE'
      "
    )
    local exit_code=$?
    
    # Verify error was captured (non-zero exit code)
    if [[ ${exit_code} -ne 0 ]]; then
      # Verify error output contains meaningful information
      if [[ -n "${output}" ]] && echo "${output}" | grep -q "Error:\|S3\|upload\|Failed"; then
        # Verify script halted (should not contain continuation marker)
        if ! echo "${output}" | grep -q "SHOULD_NOT_REACH_HERE"; then
          ((success_count++))
        fi
      fi
    fi
    
    unset -f aws
  done
  
  # All iterations should successfully capture errors and halt
  [[ ${success_count} -eq ${iterations} ]]
}

@test "Property 8.3: CloudWatch query errors are captured and displayed (100 iterations)" {
  local iterations=100
  local success_count=0
  
  for ((i=0; i<iterations; i++)); do
    # Generate random CloudWatch error types
    local error_types=("ResourceNotFoundException" "AccessDenied" "ThrottlingException" "RequestTimeout")
    local random_index=$((RANDOM % ${#error_types[@]}))
    local error_type="${error_types[$random_index]}"
    
    # Generate random error message
    local error_message="Test error ${RANDOM}"
    
    # Create error output based on type
    local aws_error_output
    case "$error_type" in
      ResourceNotFoundException)
        aws_error_output="An error occurred (ResourceNotFoundException) when calling the FilterLogEvents operation: The specified log group does not exist."
        ;;
      AccessDenied)
        aws_error_output="An error occurred (AccessDenied) when calling the FilterLogEvents operation: User is not authorized to perform: logs:FilterLogEvents"
        ;;
      ThrottlingException)
        aws_error_output="An error occurred (ThrottlingException) when calling the FilterLogEvents operation: Rate exceeded"
        ;;
      RequestTimeout)
        aws_error_output="An error occurred (RequestTimeout) when calling the FilterLogEvents operation: Connection timeout"
        ;;
    esac
    
    # Call handle_cloudwatch_error with mock input and capture output
    local output
    output=$(
      # Simulate user choosing to continue (option 'c')
      echo "c" | handle_cloudwatch_error "${aws_error_output}" 2>&1
    )
    local exit_code=$?
    
    # Verify error was displayed (output contains error information)
    if [[ -n "${output}" ]] && echo "${output}" | grep -q "Error:\|CloudWatch\|CLOUDWATCH"; then
      # Verify output contains actionable guidance
      if echo "${output}" | grep -q "Possible causes:\|To fix\|Recommendation:"; then
        # Verify user was prompted for decision
        if echo "${output}" | grep -q "What would you like to do\|Choice:"; then
          ((success_count++))
        fi
      fi
    fi
  done
  
  # All iterations should successfully capture and display errors
  [[ ${success_count} -eq ${iterations} ]]
}

@test "Property 8.4: Error output is never silent - always displayed to user (100 iterations)" {
  local iterations=100
  local success_count=0
  
  for ((i=0; i<iterations; i++)); do
    # Generate random error scenarios
    local scenarios=("auth" "s3" "cloudwatch")
    local random_index=$((RANDOM % ${#scenarios[@]}))
    local scenario="${scenarios[$random_index]}"
    
    local output=""
    local has_output=false
    
    case "$scenario" in
      auth)
        # Mock AWS CLI for auth error
        aws() {
          echo "An error occurred (ExpiredToken): Token expired" >&2
          return 255
        }
        export -f aws
        
        output=$(check_aws_credentials "test-profile" 2>&1)
        unset -f aws
        ;;
      s3)
        # S3 error - use bash subshell since it exits
        output=$(
          bash -c "
            source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
            aws() {
              echo 'An error occurred (AccessDenied): Access Denied' >&2
              return 254
            }
            export -f aws
            safe_s3_upload '/tmp/test.json' 's3://bucket/test.json' 'test-profile' 2>&1
          " || true
        )
        ;;
      cloudwatch)
        # CloudWatch error
        output=$(echo "c" | handle_cloudwatch_error "An error occurred (ThrottlingException): Rate exceeded" 2>&1)
        ;;
    esac
    
    # Verify output is not empty (error was displayed, not silent)
    if [[ -n "${output}" ]] && [[ "${output}" != "" ]]; then
      # Verify output contains error-related keywords
      if echo "${output}" | grep -qi "error\|failed\|warning\|denied\|exception"; then
        ((success_count++))
      fi
    fi
  done
  
  # All iterations should produce non-silent output
  [[ ${success_count} -eq ${iterations} ]]
}

@test "Property 8.5: Error messages contain actionable guidance (100 iterations)" {
  local iterations=100
  local success_count=0
  
  for ((i=0; i<iterations; i++)); do
    # Generate random error types across all categories
    local error_categories=("auth_expired" "auth_notfound" "s3_denied" "s3_nobucket" "cw_notfound" "cw_throttle")
    local random_index=$((RANDOM % ${#error_categories[@]}))
    local error_category="${error_categories[$random_index]}"
    
    local output=""
    
    case "$error_category" in
      auth_expired)
        aws() {
          echo "An error occurred (ExpiredToken): Token expired" >&2
          return 255
        }
        export -f aws
        output=$(check_aws_credentials "test-profile" 2>&1)
        unset -f aws
        ;;
      auth_notfound)
        aws() {
          echo "Unable to locate credentials" >&2
          return 255
        }
        export -f aws
        output=$(check_aws_credentials "test-profile" 2>&1)
        unset -f aws
        ;;
      s3_denied)
        output=$(
          bash -c "
            source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
            aws() {
              echo 'An error occurred (AccessDenied): Access Denied' >&2
              return 254
            }
            export -f aws
            safe_s3_upload '/tmp/test.json' 's3://bucket/test.json' 'test-profile' 2>&1
          " || true
        )
        ;;
      s3_nobucket)
        output=$(
          bash -c "
            source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
            aws() {
              echo 'An error occurred (NoSuchBucket): Bucket does not exist' >&2
              return 255
            }
            export -f aws
            safe_s3_upload '/tmp/test.json' 's3://bucket/test.json' 'test-profile' 2>&1
          " || true
        )
        ;;
      cw_notfound)
        output=$(echo "c" | handle_cloudwatch_error "An error occurred (ResourceNotFoundException): Log group not found" 2>&1)
        ;;
      cw_throttle)
        output=$(echo "c" | handle_cloudwatch_error "An error occurred (ThrottlingException): Rate exceeded" 2>&1)
        ;;
    esac
    
    # Verify output contains actionable guidance keywords
    if echo "${output}" | grep -q "To fix\|Possible causes\|Recommendation:\|try\|verify\|check\|configure"; then
      ((success_count++))
    fi
  done
  
  # All iterations should provide actionable guidance
  [[ ${success_count} -eq ${iterations} ]]
}
