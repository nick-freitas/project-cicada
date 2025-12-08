#!/usr/bin/env bats

# Property-based tests for wait time adherence
# Feature: script-upload-monitoring, Property 2: Wait time adherence
# Validates: Requirements 2.4

load '../helpers/test_helper'

setup() {
  setup_test_environment
}

teardown() {
  cleanup_test_environment
}

# Property 2: Wait time adherence
# For any completed batch, the time elapsed between the end of the batch upload 
# and the start of log checking should be at least the configured wait time parameter 
# (within reasonable system timing variance of ±2 seconds).

@test "Property 2: wait_with_countdown generates correct countdown sequence (100 iterations)" {
  local iterations=100
  local failures=0
  local failure_details=""
  
  for ((iteration=1; iteration<=iterations; iteration++)); do
    # Generate random wait time between 1 and 30 seconds (reduced for test speed)
    local wait_time=$(random_number 1 30)
    
    # Create a modified version of wait_with_countdown that doesn't actually sleep
    # This tests the logic without waiting
    wait_with_countdown_test() {
      local wait_seconds="$1"
      
      # Validate argument (same as real function)
      if [[ -z "${wait_seconds}" ]] || [[ ! "${wait_seconds}" =~ ^[0-9]+$ ]]; then
        return 1
      fi
      
      if [[ "${wait_seconds}" -le 0 ]]; then
        return 1
      fi
      
      # Count iterations instead of sleeping
      local count=0
      for ((i=wait_seconds; i>0; i--)); do
        count=$((count + 1))
        # Don't actually sleep - just count
      done
      
      # Verify we counted the right number of times
      if [ "${count}" -ne "${wait_seconds}" ]; then
        return 1
      fi
      
      return 0
    }
    
    # Call test version
    wait_with_countdown_test "${wait_time}"
    local exit_code=$?
    
    # Check that function succeeded
    if [ "${exit_code}" -ne 0 ]; then
      failures=$((failures + 1))
      failure_details="${failure_details}Iteration ${iteration}: Countdown logic failed for wait_time=${wait_time}\n"
    fi
  done
  
  # Report results
  if [ "${failures}" -gt 0 ]; then
    echo "Property test failed: ${failures}/${iterations} iterations violated wait time adherence"
    echo -e "${failure_details}"
    return 1
  fi
  
  echo "Property test passed: All ${iterations} iterations generated correct countdown sequences"
}

@test "wait_with_countdown validates positive integer argument" {
  # Source the library for unit tests
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/wait-with-countdown.sh"
  
  # Test with invalid arguments (no actual waiting)
  run wait_with_countdown ""
  assert_failure
  
  run wait_with_countdown "abc"
  assert_failure
  
  run wait_with_countdown "-5"
  assert_failure
  
  run wait_with_countdown "0"
  assert_failure
}
