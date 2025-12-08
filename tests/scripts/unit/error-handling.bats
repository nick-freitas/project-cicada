#!/usr/bin/env bats

# Unit tests for error handling functions
# Tests specific error scenarios and edge cases
# Requirements: 5.1, 5.2, 5.3, 5.4

load '../helpers/test_helper'

setup() {
  # Source the error handling library
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh"
  
  # Set up test environment
  export PROFILE="test-profile"
  export BUCKET="test-bucket"
}

# Test authentication error detection and messaging

@test "check_aws_credentials: detects credentials not found error" {
  # Mock AWS CLI to return credentials not found error
  aws() {
    echo "Unable to locate credentials. You can configure credentials by running \"aws configure\"." >&2
    return 255
  }
  export -f aws
  
  # Call function and capture output
  run check_aws_credentials "test-profile"
  
  # Verify failure
  [ "$status" -eq 1 ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "credentials not found" ]]
  [[ "${output}" =~ "aws configure" ]]
  
  unset -f aws
}

@test "check_aws_credentials: detects expired token error" {
  # Mock AWS CLI to return expired token error
  aws() {
    echo "An error occurred (ExpiredToken) when calling the GetCallerIdentity operation: The security token included in the request is expired" >&2
    return 255
  }
  export -f aws
  
  # Call function and capture output
  run check_aws_credentials "test-profile"
  
  # Verify failure
  [ "$status" -eq 1 ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "expired" ]]
  [[ "${output}" =~ "aws sso login" ]]
  
  unset -f aws
}

@test "check_aws_credentials: detects invalid credentials error" {
  # Mock AWS CLI to return invalid credentials error
  aws() {
    echo "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid." >&2
    return 403
  }
  export -f aws
  
  # Call function and capture output
  run check_aws_credentials "test-profile"
  
  # Verify failure
  [ "$status" -eq 1 ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "invalid" ]]
  
  unset -f aws
}

@test "check_aws_credentials: succeeds with valid credentials" {
  # Mock AWS CLI to return success
  aws() {
    echo '{"UserId": "AIDAI123456789", "Account": "123456789012", "Arn": "arn:aws:iam::123456789012:user/test"}'
    return 0
  }
  export -f aws
  
  # Call function
  run check_aws_credentials "test-profile"
  
  # Verify success
  [ "$status" -eq 0 ]
  
  unset -f aws
}

@test "check_aws_credentials: requires profile argument" {
  # Call without profile argument
  run check_aws_credentials
  
  # Verify failure
  [ "$status" -eq 1 ]
  
  # Verify error message
  [[ "${output}" =~ "requires profile argument" ]]
}

# Test S3 upload failure handling

@test "handle_s3_upload_error: displays NoSuchBucket error with guidance" {
  local error_output="An error occurred (NoSuchBucket) when calling the PutObject operation: The specified bucket does not exist"
  
  # Call function in subshell (since it exits) and capture output
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    handle_s3_upload_error 'test.json' '${error_output}' 2>&1
    echo 'SHOULD_NOT_REACH'
  "
  
  # Verify it exited with S3 error code
  [ "$status" -eq ${EXIT_S3_ERROR} ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "S3 UPLOAD FAILURE" ]]
  [[ "${output}" =~ "bucket does not exist" ]]
  [[ "${output}" =~ "Verify the bucket name" ]]
  
  # Verify it halted (didn't continue)
  [[ ! "${output}" =~ "SHOULD_NOT_REACH" ]]
}

@test "handle_s3_upload_error: displays AccessDenied error with guidance" {
  local error_output="An error occurred (AccessDenied) when calling the PutObject operation: Access Denied"
  
  # Call function in subshell and capture output
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    handle_s3_upload_error 'test.json' '${error_output}' 2>&1
    echo 'SHOULD_NOT_REACH'
  "
  
  # Verify it exited with S3 error code
  [ "$status" -eq ${EXIT_S3_ERROR} ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "Access denied" ]]
  [[ "${output}" =~ "IAM" ]]
  [[ "${output}" =~ "s3:PutObject" ]]
  
  # Verify it halted
  [[ ! "${output}" =~ "SHOULD_NOT_REACH" ]]
}

@test "handle_s3_upload_error: displays network timeout error with guidance" {
  local error_output="An error occurred (RequestTimeout) when calling the PutObject operation: Connection timeout"
  
  # Call function in subshell and capture output
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    handle_s3_upload_error 'test.json' '${error_output}' 2>&1
    echo 'SHOULD_NOT_REACH'
  "
  
  # Verify it exited with S3 error code
  [ "$status" -eq ${EXIT_S3_ERROR} ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "Network connection" ]]
  [[ "${output}" =~ "internet connection" ]]
  
  # Verify it halted
  [[ ! "${output}" =~ "SHOULD_NOT_REACH" ]]
}

# Test CloudWatch query failure handling

@test "handle_cloudwatch_error: displays ResourceNotFoundException with guidance" {
  local error_output="An error occurred (ResourceNotFoundException) when calling the FilterLogEvents operation: The specified log group does not exist."
  
  # Simulate user choosing to continue
  output=$(echo "c" | handle_cloudwatch_error "${error_output}" 2>&1)
  exit_code=$?
  
  # Verify return code (0 = continue)
  [ "$exit_code" -eq 0 ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "CLOUDWATCH QUERY FAILURE" ]]
  [[ "${output}" =~ "Log group not found" ]]
  [[ "${output}" =~ "Lambda function has not been invoked" ]]
}

@test "handle_cloudwatch_error: displays AccessDenied with guidance" {
  local error_output="An error occurred (AccessDenied) when calling the FilterLogEvents operation: User is not authorized"
  
  # Simulate user choosing to continue
  output=$(echo "c" | handle_cloudwatch_error "${error_output}" 2>&1)
  exit_code=$?
  
  # Verify return code
  [ "$exit_code" -eq 0 ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "Access denied" ]]
  [[ "${output}" =~ "logs:FilterLogEvents" ]]
}

@test "handle_cloudwatch_error: displays ThrottlingException with guidance" {
  local error_output="An error occurred (ThrottlingException) when calling the FilterLogEvents operation: Rate exceeded"
  
  # Simulate user choosing to retry
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    echo 'r' | handle_cloudwatch_error '${error_output}' 2>&1
  "
  
  # Verify return code (2 = retry)
  [ "$status" -eq 2 ]
  
  # Verify error message contains expected content
  [[ "${output}" =~ "rate limit" ]]
  [[ "${output}" =~ "Retry" ]]
}

@test "handle_cloudwatch_error: user can choose to continue" {
  local error_output="Some error"
  
  # Simulate user choosing to continue
  output=$(echo "c" | handle_cloudwatch_error "${error_output}" 2>&1)
  exit_code=$?
  
  # Verify return code (0 = continue)
  [ "$exit_code" -eq 0 ]
  
  # Verify output shows continuation
  [[ "${output}" =~ "Continuing without monitoring" ]]
}

@test "handle_cloudwatch_error: user can choose to abort" {
  local error_output="Some error"
  
  # Simulate user choosing to abort
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    echo 'a' | handle_cloudwatch_error '${error_output}' 2>&1
  "
  
  # Verify return code (1 = abort)
  [ "$status" -eq 1 ]
  
  # Verify output shows abort
  [[ "${output}" =~ "Aborting" ]]
}

@test "handle_cloudwatch_error: user can choose to retry" {
  local error_output="Some error"
  
  # Simulate user choosing to retry
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    echo 'r' | handle_cloudwatch_error '${error_output}' 2>&1
  "
  
  # Verify return code (2 = retry)
  [ "$status" -eq 2 ]
  
  # Verify output shows retry
  [[ "${output}" =~ "Retrying" ]]
}

@test "handle_cloudwatch_error: handles invalid input and re-prompts" {
  local error_output="Some error"
  
  # Simulate invalid input followed by valid input
  output=$(echo -e "x\nc" | handle_cloudwatch_error "${error_output}" 2>&1)
  exit_code=$?
  
  # Verify it eventually succeeded
  [ "$exit_code" -eq 0 ]
  
  # Verify it showed invalid choice message
  [[ "${output}" =~ "Invalid choice" ]]
}

# Test graceful degradation

@test "offer_monitoring_degradation: user can choose to continue" {
  # Simulate user choosing yes
  output=$(echo "y" | offer_monitoring_degradation 2>&1)
  exit_code=$?
  
  # Verify return code (0 = continue)
  [ "$exit_code" -eq 0 ]
  
  # Verify warning is displayed
  [[ "${output}" =~ "WARNING" ]]
  [[ "${output}" =~ "errors will NOT be detected" ]]
  
  # Verify continuation message
  [[ "${output}" =~ "Monitoring disabled" ]]
}

@test "offer_monitoring_degradation: user can choose to abort" {
  # Simulate user choosing no
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    echo 'n' | offer_monitoring_degradation 2>&1
  "
  
  # Verify return code (1 = abort)
  [ "$status" -eq 1 ]
  
  # Verify abort message
  [[ "${output}" =~ "Aborting" ]]
}

@test "offer_monitoring_degradation: handles invalid input and re-prompts" {
  # Simulate invalid input followed by valid input
  output=$(echo -e "x\ny" | offer_monitoring_degradation 2>&1)
  exit_code=$?
  
  # Verify it eventually succeeded
  [ "$exit_code" -eq 0 ]
  
  # Verify it showed invalid choice message
  [[ "${output}" =~ "Invalid choice" ]]
}

# Test safe_s3_upload wrapper

@test "safe_s3_upload: succeeds with valid upload" {
  # Mock AWS CLI to succeed
  aws() {
    echo "upload: /tmp/test.json to s3://bucket/test.json"
    return 0
  }
  export -f aws
  
  # Call function
  run safe_s3_upload "/tmp/test.json" "s3://bucket/test.json" "test-profile"
  
  # Verify success
  [ "$status" -eq 0 ]
  
  unset -f aws
}

@test "safe_s3_upload: requires all arguments" {
  # Call with missing arguments
  run safe_s3_upload "/tmp/test.json"
  
  # Verify failure
  [ "$status" -eq 1 ]
  
  # Verify error message
  [[ "${output}" =~ "requires" ]]
}

@test "safe_s3_upload: exits on S3 failure" {
  # Call function in subshell (since it exits)
  run bash -c "
    source '${BATS_TEST_DIRNAME}/../../../scripts/lib/error-handling.sh'
    aws() {
      echo 'An error occurred (AccessDenied): Access Denied' >&2
      return 254
    }
    export -f aws
    safe_s3_upload '/tmp/test.json' 's3://bucket/test.json' 'test-profile' 2>&1
    echo 'SHOULD_NOT_REACH'
  "
  
  # Verify it exited with error
  [ "$status" -ne 0 ]
  
  # Verify it halted
  [[ ! "${output}" =~ "SHOULD_NOT_REACH" ]]
}
