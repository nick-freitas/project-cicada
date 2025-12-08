#!/usr/bin/env bats

# Unit tests for CloudWatch log group discovery functionality
# Tests the discover_log_group function in upload-unprocessed-scripts.sh

load '../helpers/test_helper'

# Source the log group discovery library
setup() {
  setup_test_environment
  
  # Set default variables needed by the function
  export MONITORING_ENABLED=true
  export PROFILE="test-profile"
  export LOG_GROUP=""
  
  # Source the log group discovery library
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/log-group-discovery.sh"
}

teardown() {
  cleanup_test_environment
}

@test "discover_log_group: successful discovery with single matching log group" {
  # Mock AWS CLI response with a single matching log group
  local mock_response='{
    "logGroups": [
      {
        "logGroupName": "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123",
        "creationTime": 1702000000000,
        "storedBytes": 1024
      }
    ]
  }'
  
  mock_aws_logs_describe_log_groups "${mock_response}" 0
  
  # Run the discover_log_group function (capture output but don't use subshell for variables)
  run discover_log_group
  
  # Should succeed
  assert_success
  
  # Should display discovery message
  assert_output --partial "Discovering CloudWatch log group"
  assert_output --partial "Found log group: /aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123"
  
  # Run again without 'run' to check variable assignment
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1
  
  # LOG_GROUP variable should be set
  assert [ -n "${LOG_GROUP}" ]
  assert [ "${LOG_GROUP}" = "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123" ]
  
  # MONITORING_ENABLED should remain true
  assert [ "${MONITORING_ENABLED}" = "true" ]
}

@test "discover_log_group: successful discovery with multiple matching log groups (uses first)" {
  # Mock AWS CLI response with multiple matching log groups
  local mock_response='{
    "logGroups": [
      {
        "logGroupName": "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123",
        "creationTime": 1702000000000,
        "storedBytes": 1024
      },
      {
        "logGroupName": "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-def456",
        "creationTime": 1702000001000,
        "storedBytes": 2048
      }
    ]
  }'
  
  mock_aws_logs_describe_log_groups "${mock_response}" 0
  
  # Run the discover_log_group function
  run discover_log_group
  
  # Should succeed
  assert_success
  
  # Should use the first matching log group
  assert_output --partial "Found log group: /aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123"
  
  # Run again without 'run' to check variable assignment
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1
  
  # LOG_GROUP should be set to the first one
  assert [ "${LOG_GROUP}" = "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123" ]
}

@test "discover_log_group: handles missing log group gracefully" {
  # Mock AWS CLI response with no matching log groups
  local mock_response='{
    "logGroups": [
      {
        "logGroupName": "/aws/lambda/SomeOtherFunction",
        "creationTime": 1702000000000,
        "storedBytes": 1024
      }
    ]
  }'
  
  mock_aws_logs_describe_log_groups "${mock_response}" 0
  
  # Run the discover_log_group function
  run discover_log_group
  
  # Should fail (return 1) but not crash
  assert_failure
  
  # Should display warning message
  assert_output --partial "Could not find ScriptIngestionHandler log group"
  assert_output --partial "Monitoring will be disabled"
  
  # Run again without 'run' to check variable assignment
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1 || true
  
  # LOG_GROUP should be empty
  assert [ -z "${LOG_GROUP}" ]
  
  # MONITORING_ENABLED should be set to false
  assert [ "${MONITORING_ENABLED}" = "false" ]
}

@test "discover_log_group: handles empty log groups list" {
  # Mock AWS CLI response with empty log groups
  local mock_response='{
    "logGroups": []
  }'
  
  mock_aws_logs_describe_log_groups "${mock_response}" 0
  
  # Run the discover_log_group function
  run discover_log_group
  
  # Should fail gracefully
  assert_failure
  
  # Should display warning
  assert_output --partial "Could not find ScriptIngestionHandler log group"
  
  # Run again without 'run' to check variable assignment
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1 || true
  
  # Monitoring should be disabled
  assert [ "${MONITORING_ENABLED}" = "false" ]
}

@test "discover_log_group: handles AWS CLI authentication errors" {
  # Mock AWS CLI error response
  mock_aws_error "ExpiredToken" 255
  
  # Run the discover_log_group function
  run discover_log_group
  
  # Should fail gracefully
  assert_failure
  
  # Should display error message
  assert_output --partial "Failed to query CloudWatch log groups"
  assert_output --partial "Monitoring will be disabled"
  
  # Run again without 'run' to check variable assignment
  LOG_GROUP=""
  MONITORING_ENABLED=true
  mock_aws_error "ExpiredToken" 255
  discover_log_group > /dev/null 2>&1 || true
  
  # MONITORING_ENABLED should be set to false
  assert [ "${MONITORING_ENABLED}" = "false" ]
}

@test "discover_log_group: handles AWS CLI network errors" {
  # Mock AWS CLI network error
  mock_aws_error "NetworkError" 255
  
  # Run the discover_log_group function
  run discover_log_group
  
  # Should fail gracefully
  assert_failure
  
  # Should display error message
  assert_output --partial "Failed to query CloudWatch log groups"
  
  # Run again without 'run' to check variable assignment
  LOG_GROUP=""
  MONITORING_ENABLED=true
  mock_aws_error "NetworkError" 255
  discover_log_group > /dev/null 2>&1 || true
  
  # Monitoring should be disabled
  assert [ "${MONITORING_ENABLED}" = "false" ]
}

@test "discover_log_group: skips discovery when monitoring is disabled" {
  # Disable monitoring
  MONITORING_ENABLED=false
  
  # Don't mock AWS CLI (should not be called)
  
  # Run the discover_log_group function
  run discover_log_group
  
  # Should succeed without doing anything
  assert_success
  
  # Should not display discovery message
  refute_output --partial "Discovering CloudWatch log group"
  
  # LOG_GROUP should remain empty
  assert [ -z "${LOG_GROUP}" ]
}

@test "discover_log_group: caches log group name for reuse" {
  # Mock AWS CLI response
  local mock_response='{
    "logGroups": [
      {
        "logGroupName": "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-xyz789",
        "creationTime": 1702000000000,
        "storedBytes": 1024
      }
    ]
  }'
  
  mock_aws_logs_describe_log_groups "${mock_response}" 0
  
  # Run the discover_log_group function without 'run' to preserve variables
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1
  
  # LOG_GROUP should be set and persist
  assert [ "${LOG_GROUP}" = "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-xyz789" ]
  
  # Verify the variable is in the global scope (not just function scope)
  # by checking it's still set after the function returns
  run echo "${LOG_GROUP}"
  assert_output "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-xyz789"
}

@test "discover_log_group: filters log groups by ScriptIngestionHandler name" {
  # Mock AWS CLI response with various log groups
  local mock_response='{
    "logGroups": [
      {
        "logGroupName": "/aws/lambda/SomeOtherFunction",
        "creationTime": 1702000000000,
        "storedBytes": 1024
      },
      {
        "logGroupName": "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123",
        "creationTime": 1702000001000,
        "storedBytes": 2048
      },
      {
        "logGroupName": "/aws/lambda/AnotherFunction",
        "creationTime": 1702000002000,
        "storedBytes": 512
      }
    ]
  }'
  
  mock_aws_logs_describe_log_groups "${mock_response}" 0
  
  # Run the discover_log_group function without 'run' to preserve variables
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1
  
  # Should find the correct log group (not the others)
  assert [ "${LOG_GROUP}" = "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-abc123" ]
  
  # Should not contain other function names
  assert [ "${LOG_GROUP}" != "/aws/lambda/SomeOtherFunction" ]
  assert [ "${LOG_GROUP}" != "/aws/lambda/AnotherFunction" ]
}

@test "discover_log_group: uses correct AWS profile" {
  # Set a specific profile
  PROFILE="custom-profile"
  
  # Create a mock that verifies the profile is used
  cat > "${MOCK_BIN_DIR}/aws" << 'EOF'
#!/usr/bin/env bash
# Check if --profile flag is present with correct value
if [[ "$*" == *"--profile custom-profile"* ]]; then
  echo '{"logGroups": [{"logGroupName": "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-test"}]}'
  exit 0
else
  echo "Error: Expected --profile custom-profile" >&2
  exit 1
fi
EOF
  chmod +x "${MOCK_BIN_DIR}/aws"
  
  # Run the discover_log_group function without 'run' to preserve variables
  LOG_GROUP=""
  MONITORING_ENABLED=true
  discover_log_group > /dev/null 2>&1
  
  # Should find the log group (meaning the profile was used correctly)
  assert [ "${LOG_GROUP}" = "/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler-test" ]
}

