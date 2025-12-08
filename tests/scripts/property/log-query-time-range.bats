#!/usr/bin/env bats

# Property-based tests for CloudWatch log query time range accuracy
# Feature: script-upload-monitoring, Property 3: Log query time range accuracy
# Validates: Requirements 1.3

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

# Property Test: Log query time range accuracy
# For any CloudWatch log query, the time range queried should cover exactly
# the wait period plus a small buffer (5 seconds) to account for clock skew
# and Lambda execution delays.
@test "Property 3: Log query time range covers wait period plus buffer" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate random wait time between 5 and 120 seconds
    local wait_time=$(random_number 5 120)
    
    # Record time before calculation
    local before_time_s=$(date +%s)
    
    # Calculate timestamps
    calculate_log_query_timestamps "${wait_time}"
    
    # Record time after calculation
    local after_time_s=$(date +%s)
    
    # Verify timestamps are set
    if [[ -z "${LOG_QUERY_START_MS}" ]] || [[ -z "${LOG_QUERY_END_MS}" ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Timestamps not set (wait_time=${wait_time})\n"
      continue
    fi
    
    # Convert to seconds
    local start_time_s=$((LOG_QUERY_START_MS / 1000))
    local end_time_s=$((LOG_QUERY_END_MS / 1000))
    
    # Calculate actual duration
    local actual_duration_s=$((end_time_s - start_time_s))
    
    # Expected duration is wait_time + 5 second buffer
    local expected_duration=$((wait_time + 5))
    
    # Allow for ±2 second tolerance due to system timing variance
    local min_duration=$((expected_duration - 2))
    local max_duration=$((expected_duration + 2))
    
    # Check if duration is within acceptable range
    if [[ ${actual_duration_s} -lt ${min_duration} ]] || [[ ${actual_duration_s} -gt ${max_duration} ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Duration out of range\n"
      failure_details="${failure_details}  Wait time: ${wait_time}s\n"
      failure_details="${failure_details}  Expected: ${expected_duration}s (±2s)\n"
      failure_details="${failure_details}  Actual: ${actual_duration_s}s\n"
      failure_details="${failure_details}  Start: ${start_time_s}, End: ${end_time_s}\n\n"
      continue
    fi
    
    # Verify start time is approximately wait_time seconds before current time
    local expected_start=$((before_time_s - wait_time))
    local start_diff=$((start_time_s - expected_start))
    local abs_start_diff=${start_diff#-}  # Absolute value
    
    if [[ ${abs_start_diff} -gt 2 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Start time inaccurate\n"
      failure_details="${failure_details}  Wait time: ${wait_time}s\n"
      failure_details="${failure_details}  Expected start: ~${expected_start}\n"
      failure_details="${failure_details}  Actual start: ${start_time_s}\n"
      failure_details="${failure_details}  Difference: ${start_diff}s\n\n"
      continue
    fi
    
    # Verify end time is approximately 5 seconds after current time
    local expected_end=$((after_time_s + 5))
    local end_diff=$((end_time_s - expected_end))
    local abs_end_diff=${end_diff#-}  # Absolute value
    
    if [[ ${abs_end_diff} -gt 2 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: End time inaccurate\n"
      failure_details="${failure_details}  Wait time: ${wait_time}s\n"
      failure_details="${failure_details}  Expected end: ~${expected_end}\n"
      failure_details="${failure_details}  Actual end: ${end_time_s}\n"
      failure_details="${failure_details}  Difference: ${end_diff}s\n\n"
      continue
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

# Property Test: Time range consistency across multiple calls
# For any sequence of calls with the same wait time, the duration should
# remain consistent (within tolerance)
@test "Property 3: Time range duration is consistent across calls" {
  local iterations=50
  local wait_time=30
  local failures=0
  local failure_details=""
  local durations=()
  
  for ((i=1; i<=iterations; i++)); do
    # Calculate timestamps
    calculate_log_query_timestamps "${wait_time}"
    
    # Calculate duration
    local start_time_s=$((LOG_QUERY_START_MS / 1000))
    local end_time_s=$((LOG_QUERY_END_MS / 1000))
    local duration_s=$((end_time_s - start_time_s))
    
    durations+=("${duration_s}")
    
    # Small delay to ensure time progresses
    sleep 0.1
  done
  
  # Calculate mean duration
  local sum=0
  for duration in "${durations[@]}"; do
    sum=$((sum + duration))
  done
  local mean=$((sum / iterations))
  
  # Check that all durations are within ±2 seconds of mean
  for ((i=0; i<iterations; i++)); do
    local duration="${durations[$i]}"
    local diff=$((duration - mean))
    local abs_diff=${diff#-}
    
    if [[ ${abs_diff} -gt 2 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration $((i+1)): Duration ${duration}s differs from mean ${mean}s by ${diff}s\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations had inconsistent durations"
    echo "Mean duration: ${mean}s"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: All ${iterations} iterations had consistent durations (mean: ${mean}s)"
  return 0
}

# Property Test: Timestamps are always in milliseconds
# For any wait time, the timestamps should be in milliseconds (13 digits)
@test "Property 3: Timestamps are in milliseconds format" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate random wait time
    local wait_time=$(random_number 1 300)
    
    # Calculate timestamps
    calculate_log_query_timestamps "${wait_time}"
    
    # Check that timestamps are 13 digits (milliseconds since epoch)
    local start_digits=${#LOG_QUERY_START_MS}
    local end_digits=${#LOG_QUERY_END_MS}
    
    if [[ ${start_digits} -ne 13 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Start timestamp has ${start_digits} digits (expected 13)\n"
      failure_details="${failure_details}  Value: ${LOG_QUERY_START_MS}\n\n"
    fi
    
    if [[ ${end_digits} -ne 13 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: End timestamp has ${end_digits} digits (expected 13)\n"
      failure_details="${failure_details}  Value: ${LOG_QUERY_END_MS}\n\n"
    fi
    
    # Verify end time is after start time
    if [[ ${LOG_QUERY_END_MS} -le ${LOG_QUERY_START_MS} ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: End time not after start time\n"
      failure_details="${failure_details}  Start: ${LOG_QUERY_START_MS}\n"
      failure_details="${failure_details}  End: ${LOG_QUERY_END_MS}\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures} timestamp format errors"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: All ${iterations} iterations produced valid millisecond timestamps"
  return 0
}

# Property Test: Buffer is always 5 seconds
# For any wait time, the buffer between current time and end time should be 5 seconds
@test "Property 3: End time buffer is consistently 5 seconds" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((i=1; i<=iterations; i++)); do
    # Generate random wait time
    local wait_time=$(random_number 5 120)
    
    # Record current time
    local current_time_s=$(date +%s)
    
    # Calculate timestamps
    calculate_log_query_timestamps "${wait_time}"
    
    # Calculate buffer (end time - current time)
    local end_time_s=$((LOG_QUERY_END_MS / 1000))
    local buffer_s=$((end_time_s - current_time_s))
    
    # Buffer should be approximately 5 seconds (±2 second tolerance)
    if [[ ${buffer_s} -lt 3 ]] || [[ ${buffer_s} -gt 7 ]]; then
      ((failures++))
      failure_details="${failure_details}Iteration ${i}: Buffer out of range\n"
      failure_details="${failure_details}  Wait time: ${wait_time}s\n"
      failure_details="${failure_details}  Expected buffer: 5s (±2s)\n"
      failure_details="${failure_details}  Actual buffer: ${buffer_s}s\n\n"
    fi
  done
  
  # Report results
  if [[ ${failures} -gt 0 ]]; then
    echo "Property test failed: ${failures}/${iterations} iterations had incorrect buffer"
    echo ""
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: All ${iterations} iterations had correct 5-second buffer"
  return 0
}
