#!/usr/bin/env bats

# Unit tests for CloudWatch log querying functionality
# Tests the check_logs() function and related utilities

load '../helpers/test_helper'

# Setup before each test
setup() {
  setup_test_environment
  
  # Source the libraries
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/cloudwatch-logs.sh"
  
  # Set required environment variables
  export LOG_GROUP="/aws/lambda/TestFunction"
  export PROFILE="test-profile"
}

# Cleanup after each test
teardown() {
  cleanup_test_environment
}

# Test: Successful query with no errors
@test "check_logs returns 0 when no errors found" {
  # Mock AWS CLI to return empty events array
  local mock_response='{"events": [], "searchedLogStreams": []}'
  mock_aws_logs_filter_events "${mock_response}" 0
  
  # Calculate timestamps (30 seconds ago to now)
  local current_time_ms=$(($(date +%s) * 1000))
  local start_time_ms=$((current_time_ms - 30000))
  local end_time_ms=$((current_time_ms + 5000))
  
  # Call check_logs directly (not with run, to preserve variables)
  check_logs "${start_time_ms}" "${end_time_ms}"
  local result=$?
  
  # Should return 0 (no errors)
  [ "${result}" -eq 0 ]
  
  # Should set error count to 0
  [ "${LAST_ERROR_COUNT}" -eq 0 ]
}

# Test: Successful query with multiple errors
@test "check_logs returns 1 when errors found" {
  # Mock AWS CLI to return events with errors (simplified JSON)
  local mock_response='{"events":[{"timestamp":1702000000000,"message":"ERROR 1"},{"timestamp":1702000010000,"message":"ERROR 2"}],"searchedLogStreams":[]}'
  mock_aws_logs_filter_events "${mock_response}" 0
  
  # Verify mock is working
  local test_output
  test_output=$("${MOCK_BIN_DIR}/aws" logs filter-log-events --test 2>&1)
  local test_count
  test_count=$(echo "${test_output}" | jq -r '.events | length' 2>/dev/null)
  [ "${test_count}" -eq 2 ]
  
  # Calculate timestamps
  local current_time_ms=$(($(date +%s) * 1000))
  local start_time_ms=$((current_time_ms - 30000))
  local end_time_ms=$((current_time_ms + 5000))
  
  # Call check_logs directly (not with run, to preserve variables)
  # Use || true to prevent bats from treating return 1 as test failure
  check_logs "${start_time_ms}" "${end_time_ms}" || local result=$?
  
  # Should return 1 (errors found)
  [ "${result}" -eq 1 ]
  
  # Should set error count to 2
  [ "${LAST_ERROR_COUNT}" -eq 2 ]
}

# Test: AWS CLI failure handling
@test "check_logs returns 2 on AWS CLI failure" {
  # Mock AWS CLI to fail
  mock_aws_error "AccessDenied" 255
  
  # Calculate timestamps
  local current_time_ms=$(($(date +%s) * 1000))
  local start_time_ms=$((current_time_ms - 30000))
  local end_time_ms=$((current_time_ms + 5000))
  
  # Run check_logs
  run check_logs "${start_time_ms}" "${end_time_ms}"
  
  # Should return 2 (AWS CLI error)
  [ "${status}" -eq 2 ]
  
  # Should output error message
  [[ "${output}" == *"Failed to query CloudWatch logs"* ]]
}

# Test: Missing LOG_GROUP variable
@test "check_logs returns 2 when LOG_GROUP not set" {
  # Unset LOG_GROUP
  unset LOG_GROUP
  
  # Calculate timestamps
  local current_time_ms=$(($(date +%s) * 1000))
  local start_time_ms=$((current_time_ms - 30000))
  local end_time_ms=$((current_time_ms + 5000))
  
  # Run check_logs
  run check_logs "${start_time_ms}" "${end_time_ms}"
  
  # Should return 2 (error)
  [ "${status}" -eq 2 ]
  
  # Should output error message
  [[ "${output}" == *"LOG_GROUP not set"* ]]
}

# Test: Missing timestamp parameters
@test "check_logs returns 2 when timestamps missing" {
  # Run check_logs without parameters
  run check_logs
  
  # Should return 2 (error)
  [ "${status}" -eq 2 ]
  
  # Should output error message
  [[ "${output}" == *"requires start and end timestamps"* ]]
}

# Test: Timestamp calculation accuracy
@test "calculate_log_query_timestamps calculates correct range" {
  # Get current time before calculation
  local before_time_s=$(date +%s)
  
  # Calculate timestamps for 30 second wait (call directly to preserve variables)
  calculate_log_query_timestamps 30
  local result=$?
  
  # Get current time after calculation
  local after_time_s=$(date +%s)
  
  # Should succeed
  [ "${result}" -eq 0 ]
  
  # Verify timestamps are set
  [ -n "${LOG_QUERY_START_MS}" ]
  [ -n "${LOG_QUERY_END_MS}" ]
  
  # Convert to seconds for easier comparison
  local start_time_s=$((LOG_QUERY_START_MS / 1000))
  local end_time_s=$((LOG_QUERY_END_MS / 1000))
  
  # Start time should be approximately 30 seconds before current time
  local expected_start=$((before_time_s - 30))
  local start_diff=$((start_time_s - expected_start))
  [ "${start_diff#-}" -le 2 ]  # Within 2 seconds tolerance
  
  # End time should be approximately 5 seconds after current time
  local expected_end=$((after_time_s + 5))
  local end_diff=$((end_time_s - expected_end))
  [ "${end_diff#-}" -le 2 ]  # Within 2 seconds tolerance
  
  # Duration should be approximately 35 seconds (30 + 5 buffer)
  local duration_s=$((end_time_s - start_time_s))
  [ "${duration_s}" -ge 33 ]  # At least 33 seconds
  [ "${duration_s}" -le 37 ]  # At most 37 seconds
}

# Test: Timestamp calculation with different wait times
@test "calculate_log_query_timestamps works with various wait times" {
  # Test with 60 seconds (call directly to preserve variables)
  calculate_log_query_timestamps 60
  [ $? -eq 0 ]
  
  local start_60="${LOG_QUERY_START_MS}"
  local end_60="${LOG_QUERY_END_MS}"
  local duration_60=$(( (end_60 - start_60) / 1000 ))
  
  # Duration should be approximately 65 seconds (60 + 5 buffer)
  [ "${duration_60}" -ge 63 ]
  [ "${duration_60}" -le 67 ]
  
  # Test with 5 seconds (call directly to preserve variables)
  calculate_log_query_timestamps 5
  [ $? -eq 0 ]
  
  local start_5="${LOG_QUERY_START_MS}"
  local end_5="${LOG_QUERY_END_MS}"
  local duration_5=$(( (end_5 - start_5) / 1000 ))
  
  # Duration should be approximately 10 seconds (5 + 5 buffer)
  [ "${duration_5}" -ge 8 ]
  [ "${duration_5}" -le 12 ]
}

# Test: Invalid jq parsing
@test "check_logs handles invalid JSON response" {
  # Mock AWS CLI to return invalid JSON
  cat > "${MOCK_BIN_DIR}/aws" << 'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"logs filter-log-events"* ]]; then
  echo "This is not valid JSON"
  exit 0
fi
echo "Unexpected AWS command: $*" >&2
exit 1
EOF
  chmod +x "${MOCK_BIN_DIR}/aws"
  
  # Calculate timestamps
  local current_time_ms=$(($(date +%s) * 1000))
  local start_time_ms=$((current_time_ms - 30000))
  local end_time_ms=$((current_time_ms + 5000))
  
  # Run check_logs
  run check_logs "${start_time_ms}" "${end_time_ms}"
  
  # Should return 2 (parsing error)
  [ "${status}" -eq 2 ]
  
  # Should output error message
  [[ "${output}" == *"Failed to parse CloudWatch response"* ]]
}

# Test: Display results with no errors
@test "display_log_check_results shows success message when no errors" {
  # Set up mock data
  export LAST_LOG_OUTPUT='{"events": [], "searchedLogStreams": []}'
  export LAST_ERROR_COUNT=0
  export LOG_QUERY_START_MS=$(($(date +%s) * 1000 - 30000))
  export LOG_QUERY_END_MS=$(($(date +%s) * 1000 + 5000))
  
  # Run display function
  run display_log_check_results
  assert_success
  
  # Should show success message
  [[ "${output}" == *"No errors found"* ]]
  [[ "${output}" == *"Time range"* ]]
}

# Test: Display results with errors
@test "display_log_check_results shows error details when errors found" {
  # Set up mock data with errors
  export LAST_LOG_OUTPUT='{
    "events": [
      {
        "timestamp": 1702000000000,
        "message": "ERROR: Test error message"
      }
    ]
  }'
  export LAST_ERROR_COUNT=1
  export LOG_QUERY_START_MS=$(($(date +%s) * 1000 - 30000))
  export LOG_QUERY_END_MS=$(($(date +%s) * 1000 + 5000))
  export LOG_GROUP="/aws/lambda/TestFunction"
  
  # Run display function
  run display_log_check_results
  assert_success
  
  # Should show error header
  [[ "${output}" == *"ERRORS DETECTED"* ]]
  [[ "${output}" == *"Errors Found: 1"* ]]
  [[ "${output}" == *"Log Group: /aws/lambda/TestFunction"* ]]
}
