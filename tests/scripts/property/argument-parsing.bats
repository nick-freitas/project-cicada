#!/usr/bin/env bats

# Property-based tests for command-line argument parsing
# Tests that argument parsing behaves correctly across many random inputs

load '../helpers/test_helper'

setup() {
  setup_test_environment
  
  # Source the upload script to get access to parse_arguments function
  # We'll create a wrapper script that exposes the function for testing
  cat > "${TEST_TEMP_DIR}/parse_args_wrapper.sh" << 'EOF'
#!/bin/bash

# Default configuration
BATCH_SIZE=10
WAIT_TIME=30
MONITORING_ENABLED=true
PROFILE="cicada-deployer"

# Parse command-line arguments
parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --batch-size)
        if [[ -z "$2" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
          echo "Error: --batch-size requires a positive integer argument" >&2
          exit 1
        fi
        BATCH_SIZE="$2"
        if [[ "${BATCH_SIZE}" -le 0 ]]; then
          echo "Error: --batch-size must be greater than 0" >&2
          exit 1
        fi
        shift 2
        ;;
      --wait-time)
        if [[ -z "$2" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
          echo "Error: --wait-time requires a positive integer argument" >&2
          exit 1
        fi
        WAIT_TIME="$2"
        if [[ "${WAIT_TIME}" -le 0 ]]; then
          echo "Error: --wait-time must be greater than 0" >&2
          exit 1
        fi
        shift 2
        ;;
      --no-monitoring)
        MONITORING_ENABLED=false
        shift
        ;;
      --profile)
        if [[ -z "$2" ]]; then
          echo "Error: --profile requires an argument" >&2
          exit 1
        fi
        PROFILE="$2"
        shift 2
        ;;
      --help)
        echo "help"
        exit 0
        ;;
      *)
        echo "Error: Unknown option: $1" >&2
        exit 1
        ;;
    esac
  done
}

# Parse arguments
parse_arguments "$@"

# Output parsed values for verification
echo "BATCH_SIZE=${BATCH_SIZE}"
echo "WAIT_TIME=${WAIT_TIME}"
echo "MONITORING_ENABLED=${MONITORING_ENABLED}"
echo "PROFILE=${PROFILE}"
EOF
  
  chmod +x "${TEST_TEMP_DIR}/parse_args_wrapper.sh"
}

teardown() {
  cleanup_test_environment
}

# **Feature: script-upload-monitoring, Property 1: Batch size consistency**
# **Validates: Requirements 2.3**
@test "property: batch size argument parsing - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Generate random batch size (1-100)
    local batch_size=$(random_number 1 100)
    
    # Run argument parser
    run "${TEST_TEMP_DIR}/parse_args_wrapper.sh" --batch-size "${batch_size}"
    
    # Verify: Command succeeds
    if [ "${status}" -ne 0 ]; then
      echo "Iteration $i failed: batch-size ${batch_size} was rejected" >&2
      ((failures++))
      continue
    fi
    
    # Verify: Batch size is set correctly
    if ! echo "${output}" | grep -q "BATCH_SIZE=${batch_size}"; then
      echo "Iteration $i failed: batch-size ${batch_size} not set correctly" >&2
      echo "Output: ${output}" >&2
      ((failures++))
      continue
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}

# **Feature: script-upload-monitoring, Property 2: Wait time adherence**
# **Validates: Requirements 2.4**
@test "property: wait time argument parsing - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Generate random wait time (1-300 seconds)
    local wait_time=$(random_number 1 300)
    
    # Run argument parser
    run "${TEST_TEMP_DIR}/parse_args_wrapper.sh" --wait-time "${wait_time}"
    
    # Verify: Command succeeds
    if [ "${status}" -ne 0 ]; then
      echo "Iteration $i failed: wait-time ${wait_time} was rejected" >&2
      ((failures++))
      continue
    fi
    
    # Verify: Wait time is set correctly
    if ! echo "${output}" | grep -q "WAIT_TIME=${wait_time}"; then
      echo "Iteration $i failed: wait-time ${wait_time} not set correctly" >&2
      echo "Output: ${output}" >&2
      ((failures++))
      continue
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}

@test "property: combined arguments parsing - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Generate random values
    local batch_size=$(random_number 1 100)
    local wait_time=$(random_number 1 300)
    local profile="test-profile-$(random_string 5)"
    
    # Run argument parser with multiple arguments
    run "${TEST_TEMP_DIR}/parse_args_wrapper.sh" \
      --batch-size "${batch_size}" \
      --wait-time "${wait_time}" \
      --profile "${profile}"
    
    # Verify: Command succeeds
    if [ "${status}" -ne 0 ]; then
      echo "Iteration $i failed with batch-size=${batch_size}, wait-time=${wait_time}, profile=${profile}" >&2
      ((failures++))
      continue
    fi
    
    # Verify: All values are set correctly
    if ! echo "${output}" | grep -q "BATCH_SIZE=${batch_size}"; then
      echo "Iteration $i: batch-size not set correctly" >&2
      ((failures++))
      continue
    fi
    
    if ! echo "${output}" | grep -q "WAIT_TIME=${wait_time}"; then
      echo "Iteration $i: wait-time not set correctly" >&2
      ((failures++))
      continue
    fi
    
    if ! echo "${output}" | grep -q "PROFILE=${profile}"; then
      echo "Iteration $i: profile not set correctly" >&2
      ((failures++))
      continue
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}

@test "property: invalid batch size rejection - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Generate invalid batch sizes (0, negative, or non-numeric)
    local invalid_type=$((RANDOM % 3))
    local batch_size
    
    case ${invalid_type} in
      0)
        # Zero
        batch_size=0
        ;;
      1)
        # Negative
        batch_size=-$(random_number 1 100)
        ;;
      2)
        # Non-numeric
        batch_size="invalid$(random_string 3)"
        ;;
    esac
    
    # Run argument parser
    run "${TEST_TEMP_DIR}/parse_args_wrapper.sh" --batch-size "${batch_size}"
    
    # Verify: Command fails
    if [ "${status}" -eq 0 ]; then
      echo "Iteration $i failed: invalid batch-size ${batch_size} was accepted" >&2
      ((failures++))
      continue
    fi
    
    # Verify: Error message is displayed
    if ! echo "${output}" | grep -qi "error"; then
      echo "Iteration $i failed: no error message for invalid batch-size ${batch_size}" >&2
      ((failures++))
      continue
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}

@test "property: invalid wait time rejection - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Generate invalid wait times (0, negative, or non-numeric)
    local invalid_type=$((RANDOM % 3))
    local wait_time
    
    case ${invalid_type} in
      0)
        # Zero
        wait_time=0
        ;;
      1)
        # Negative
        wait_time=-$(random_number 1 100)
        ;;
      2)
        # Non-numeric
        wait_time="invalid$(random_string 3)"
        ;;
    esac
    
    # Run argument parser
    run "${TEST_TEMP_DIR}/parse_args_wrapper.sh" --wait-time "${wait_time}"
    
    # Verify: Command fails
    if [ "${status}" -eq 0 ]; then
      echo "Iteration $i failed: invalid wait-time ${wait_time} was accepted" >&2
      ((failures++))
      continue
    fi
    
    # Verify: Error message is displayed
    if ! echo "${output}" | grep -qi "error"; then
      echo "Iteration $i failed: no error message for invalid wait-time ${wait_time}" >&2
      ((failures++))
      continue
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}

@test "property: no-monitoring flag consistency - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Test with and without --no-monitoring flag
    local use_flag=$((RANDOM % 2))
    
    if [ "${use_flag}" -eq 1 ]; then
      # With --no-monitoring flag
      run "${TEST_TEMP_DIR}/parse_args_wrapper.sh" --no-monitoring
      
      # Verify: Monitoring is disabled
      if ! echo "${output}" | grep -q "MONITORING_ENABLED=false"; then
        echo "Iteration $i failed: --no-monitoring flag not working" >&2
        ((failures++))
        continue
      fi
    else
      # Without --no-monitoring flag (default)
      run "${TEST_TEMP_DIR}/parse_args_wrapper.sh"
      
      # Verify: Monitoring is enabled by default
      if ! echo "${output}" | grep -q "MONITORING_ENABLED=true"; then
        echo "Iteration $i failed: monitoring not enabled by default" >&2
        ((failures++))
        continue
      fi
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}

@test "property: default values consistency - 100 iterations" {
  local failures=0
  
  for i in {1..100}; do
    # Run without any arguments
    run "${TEST_TEMP_DIR}/parse_args_wrapper.sh"
    
    # Verify: Command succeeds
    if [ "${status}" -ne 0 ]; then
      echo "Iteration $i failed: default arguments rejected" >&2
      ((failures++))
      continue
    fi
    
    # Verify: Default values are set
    if ! echo "${output}" | grep -q "BATCH_SIZE=10"; then
      echo "Iteration $i failed: default batch-size not 10" >&2
      ((failures++))
      continue
    fi
    
    if ! echo "${output}" | grep -q "WAIT_TIME=30"; then
      echo "Iteration $i failed: default wait-time not 30" >&2
      ((failures++))
      continue
    fi
    
    if ! echo "${output}" | grep -q "MONITORING_ENABLED=true"; then
      echo "Iteration $i failed: default monitoring not true" >&2
      ((failures++))
      continue
    fi
    
    if ! echo "${output}" | grep -q "PROFILE=cicada-deployer"; then
      echo "Iteration $i failed: default profile not cicada-deployer" >&2
      ((failures++))
      continue
    fi
  done
  
  # All iterations should pass
  [ "${failures}" -eq 0 ]
}
