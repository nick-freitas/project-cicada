#!/usr/bin/env bats

# Property-based tests for error detection completeness
# Feature: script-upload-monitoring, Property 4: Error detection completeness
# Validates: Requirements 1.4, 3.4

load '../helpers/test_helper'

# Setup before each test
setup() {
  setup_test_environment
  
  # Source the libraries
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/cloudwatch-logs.sh"
  
  # Set required environment variables
  export LOG_GROUP="/aws/lambda/TestFunction"
  export PROFILE="test-profile"
  export LOG_QUERY_START_MS=$(($(date +%s) * 1000 - 30000))
  export LOG_QUERY_END_MS=$(($(date +%s) * 1000))
}

# Cleanup after each test
teardown() {
  cleanup_test_environment
}

# Helper function to generate random error message
generate_random_error_message() {
  local error_types=("SyntaxError" "TypeError" "ReferenceError" "ThrottlingException" "ValidationError")
  local error_type="${error_types[$((RANDOM % ${#error_types[@]}))]}"
  local error_msg="$(random_string 20)"
  echo "${error_type}: ${error_msg}"
}

# Helper function to generate random log stream name
generate_random_log_stream() {
  local date_part=$(date "+%Y/%m/%d")
  local hash=$(random_string 8)
  echo "${date_part}/[\$LATEST]${hash}"
}

# Helper function to generate CloudWatch event JSON
generate_cloudwatch_event() {
  local timestamp="$1"
  local message="$2"
  local log_stream="${3:-$(generate_random_log_stream)}"
  
  cat << EOF
{
  "logStreamName": "${log_stream}",
  "timestamp": ${timestamp},
  "message": "${message}",
  "ingestionTime": ${timestamp},
  "eventId": "$(random_string 16)"
}
EOF
}

# Helper function to generate CloudWatch response with N errors
generate_cloudwatch_response() {
  local error_count="$1"
  local base_timestamp=$(($(date +%s) * 1000))
  
  local events="["
  for ((i=0; i<error_count; i++)); do
    local timestamp=$((base_timestamp + i * 1000))
    local message=$(generate_random_error_message)
    local event=$(generate_cloudwatch_event "${timestamp}" "${message}")
    
    if [[ $i -gt 0 ]]; then
      events="${events},"
    fi
    events="${events}${event}"
  done
  events="${events}]"
  
  cat << EOF
{
  "events": ${events},
  "searchedLogStreams": [
    {
      "logStreamName": "$(generate_random_log_stream)",
      "searchedCompletely": true
    }
  ]
}
EOF
}

# Property Test: All errors in response are displayed
# For any CloudWatch log query result containing ERROR level messages,
# all error messages in the response should be displayed to the user
# with their timestamps.
@test "Property 4: All errors in CloudWatch response are displayed" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate random number of errors (0-10)
    local error_count=$(random_number 0 10)
    
    # Generate CloudWatch response with random errors
    local response=$(generate_cloudwatch_response "${error_count}")
    
    # Mock AWS CLI to return this response
    mock_aws_logs_filter_events "${response}"
    
    # Call check_logs to populate LAST_LOG_OUTPUT
    check_logs "${LOG_QUERY_START_MS}" "${LOG_QUERY_END_MS}" > /dev/null 2>&1 || true
    
    # Capture display output
    local display_output=$(display_log_check_results 2>&1)
    
    # If no errors, verify success message is shown
    if [[ ${error_count} -eq 0 ]]; then
      if [[ ! "${display_output}" == *"No errors found"* ]]; then
        ((failures++))
        failure_details="${failure_details}Iteration ${i}: Expected 'No errors found' message for 0 errors\n"
        failure_details="${failure_details}  Output: ${display_output}\n\n"
      fi
      continue
    fi
    
    # Extract all error messages from the response
    local expected_errors=()
    while IFS= read -r message; do
      expected_errors+=("${message}")
    done < <(echo "${response}" | jq -r '.events[].message' 2>/dev/null)
    
    # Verify error count is displayed
    if [[ ! "${display_output}" == *"Errors Found: ${error_count}"* ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Error count not displayed correctly\n"
      failure_details="${failure_details}  Expected: ${error_count}\n"
      failure_details="${failure_details}  Output: ${display_output}\n\n"
      continue
    fi
    
    # Verify each error message appears in the output
    local missing_errors=0
    for error_msg in "${expected_errors[@]}"; do
      # Extract the key part of the error message (without timestamp prefix)
      local error_key=$(echo "${error_msg}" | grep -oE '(SyntaxError|TypeError|ReferenceError|ThrottlingException|ValidationError):.*' || echo "${error_msg}")
      
      if [[ ! "${display_output}" == *"${error_key}"* ]]; then
        ((missing_errors++))
      fi
    done
    
    if [[ ${missing_errors} -gt 0 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: ${missing_errors}/${error_count} errors not displayed\n"
      failure_details="${failure_details}  Expected errors: ${#expected_errors[@]}\n"
      failure_details="${failure_details}  Missing: ${missing_errors}\n\n"
    fi
    
    # Verify timestamps are displayed
    local timestamp_count=$(echo "${display_output}" | grep -c '\[[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\]' || echo 0)
    if [[ ${timestamp_count} -lt ${error_count} ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Not all timestamps displayed\n"
      failure_details="${failure_details}  Expected: ${error_count} timestamps\n"
      failure_details="${failure_details}  Found: ${timestamp_count} timestamps\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations failed"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: ${iterations}/${iterations} iterations successful"
  return 0
}

# Property Test: Error display includes log stream information
# For any error in CloudWatch logs, the log stream name should be
# displayed to provide context about where the error occurred.
@test "Property 4: Error display includes log stream information" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate 1-5 errors with unique log streams
    local error_count=$(random_number 1 5)
    local base_timestamp=$(($(date +%s) * 1000))
    
    # Build events array with unique log streams
    local events="["
    local log_streams=()
    for ((j=0; j<error_count; j++)); do
      local timestamp=$((base_timestamp + j * 1000))
      local message=$(generate_random_error_message)
      local log_stream=$(generate_random_log_stream)
      log_streams+=("${log_stream}")
      
      local event=$(generate_cloudwatch_event "${timestamp}" "${message}" "${log_stream}")
      
      if [[ $j -gt 0 ]]; then
        events="${events},"
      fi
      events="${events}${event}"
    done
    events="${events}]"
    
    local response=$(cat << EOF
{
  "events": ${events},
  "searchedLogStreams": []
}
EOF
)
    
    # Mock AWS CLI
    mock_aws_logs_filter_events "${response}"
    
    # Call check_logs
    check_logs "${LOG_QUERY_START_MS}" "${LOG_QUERY_END_MS}" > /dev/null 2>&1 || true
    
    # Capture display output
    local display_output=$(display_log_check_results 2>&1)
    
    # Verify "Log Stream:" appears for each error
    local log_stream_count=$(echo "${display_output}" | grep -c 'Log Stream:' || echo 0)
    if [[ ${log_stream_count} -lt ${error_count} ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Not all log streams displayed\n"
      failure_details="${failure_details}  Expected: ${error_count} log streams\n"
      failure_details="${failure_details}  Found: ${log_stream_count} log streams\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations failed"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: ${iterations}/${iterations} iterations successful"
  return 0
}

# Property Test: Time range is always displayed
# For any log check result (with or without errors), the time range
# checked should be displayed to the user.
@test "Property 4: Time range is always displayed in results" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate random number of errors (0-10)
    local error_count=$(random_number 0 10)
    
    # Generate CloudWatch response
    local response=$(generate_cloudwatch_response "${error_count}")
    
    # Mock AWS CLI
    mock_aws_logs_filter_events "${response}"
    
    # Call check_logs
    check_logs "${LOG_QUERY_START_MS}" "${LOG_QUERY_END_MS}" > /dev/null 2>&1 || true
    
    # Capture display output
    local display_output=$(display_log_check_results 2>&1)
    
    # Verify time range is displayed
    if [[ ! "${display_output}" == *"Time"*"range"* ]] && [[ ! "${display_output}" == *"Time Range"* ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Time range not displayed\n"
      failure_details="${failure_details}  Error count: ${error_count}\n"
      failure_details="${failure_details}  Output: ${display_output}\n\n"
    fi
    
    # Verify time format (HH:MM:SS or date format)
    if [[ ! "${display_output}" =~ [0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Time format not found in output\n"
      failure_details="${failure_details}  Output: ${display_output}\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations failed"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: ${iterations}/${iterations} iterations successful"
  return 0
}

# Property Test: Multi-line error messages are preserved
# For any error message containing newlines (like stack traces),
# all lines should be displayed in the output.
@test "Property 4: Multi-line error messages are fully displayed" {
  local iterations=50
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate error with multi-line message (simulating stack trace)
    local base_timestamp=$(($(date +%s) * 1000))
    local error_type="Error"
    local error_msg="Failed to process file"
    local stack_lines=$(random_number 2 5)
    
    # Build multi-line message
    local message="${error_type}: ${error_msg}"
    local expected_lines=("${message}")
    for ((j=0; j<stack_lines; j++)); do
      local stack_line="    at function${j} (file.js:$((j+10)):5)"
      message="${message}\n${stack_line}"
      expected_lines+=("${stack_line}")
    done
    
    # Create event
    local event=$(cat << EOF
{
  "logStreamName": "$(generate_random_log_stream)",
  "timestamp": ${base_timestamp},
  "message": "${message}",
  "ingestionTime": ${base_timestamp},
  "eventId": "$(random_string 16)"
}
EOF
)
    
    local response=$(cat << EOF
{
  "events": [${event}],
  "searchedLogStreams": []
}
EOF
)
    
    # Mock AWS CLI
    mock_aws_logs_filter_events "${response}"
    
    # Call check_logs
    check_logs "${LOG_QUERY_START_MS}" "${LOG_QUERY_END_MS}" > /dev/null 2>&1 || true
    
    # Capture display output
    local display_output=$(display_log_check_results 2>&1)
    
    # Verify main error message is present
    if [[ ! "${display_output}" == *"${error_type}: ${error_msg}"* ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Main error message not displayed\n"
      failure_details="${failure_details}  Expected: ${error_type}: ${error_msg}\n\n"
      continue
    fi
    
    # Verify at least some stack trace lines are present
    local stack_found=0
    for ((j=0; j<stack_lines; j++)); do
      if [[ "${display_output}" == *"function${j}"* ]]; then
        ((stack_found++))
      fi
    done
    
    if [[ ${stack_found} -eq 0 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Stack trace lines not displayed\n"
      failure_details="${failure_details}  Expected: ${stack_lines} lines\n"
      failure_details="${failure_details}  Found: 0 lines\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations failed"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: ${iterations}/${iterations} iterations successful"
  return 0
}

# Property Test: Error count matches number of events
# For any CloudWatch response, the displayed error count should
# exactly match the number of events in the response.
@test "Property 4: Displayed error count matches actual event count" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate random number of errors (1-20)
    local error_count=$(random_number 1 20)
    
    # Generate CloudWatch response
    local response=$(generate_cloudwatch_response "${error_count}")
    
    # Mock AWS CLI
    mock_aws_logs_filter_events "${response}"
    
    # Call check_logs
    check_logs "${LOG_QUERY_START_MS}" "${LOG_QUERY_END_MS}" > /dev/null 2>&1 || true
    
    # Capture display output
    local display_output=$(display_log_check_results 2>&1)
    
    # Extract displayed error count (macOS-compatible)
    local displayed_count=$(echo "${display_output}" | grep -o 'Errors Found: [0-9]*' | grep -o '[0-9]*$' || echo "0")
    
    if [[ "${displayed_count}" != "${error_count}" ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Error count mismatch\n"
      failure_details="${failure_details}  Expected: ${error_count}\n"
      failure_details="${failure_details}  Displayed: ${displayed_count}\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations failed"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: ${iterations}/${iterations} iterations successful"
  return 0
}
