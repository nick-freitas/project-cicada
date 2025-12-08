#!/usr/bin/env bats

# Unit tests for user decision prompting
# Tests the prompt_user_decision function for different user choices

load '../helpers/test_helper'

setup() {
  setup_test_environment
  
  # Source the user decision library
  source "${BATS_TEST_DIRNAME}/../../../scripts/lib/user-decision.sh"
  
  # Create a wrapper script for testing
  cat > "${TEST_TEMP_DIR}/test_prompt.sh" <<EOF
#!/usr/bin/env bash
source "${BATS_TEST_DIRNAME}/../../../scripts/lib/user-decision.sh"
prompt_user_decision
EOF
  chmod +x "${TEST_TEMP_DIR}/test_prompt.sh"
}

teardown() {
  cleanup_test_environment
}

# Test continue decision flow
@test "prompt_user_decision returns 0 when user chooses 'c' (continue)" {
  # Simulate user input 'c'
  run bash -c "echo 'c' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_success
  assert_output --partial "Continue with next batch"
}

@test "prompt_user_decision returns 0 when user chooses 'C' (continue uppercase)" {
  # Simulate user input 'C'
  run bash -c "echo 'C' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_success
  assert_output --partial "Continue with next batch"
}

# Test abort decision flow
@test "prompt_user_decision returns 1 when user chooses 'a' (abort)" {
  # Simulate user input 'a'
  run bash -c "echo 'a' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_failure
  [ "$status" -eq 1 ]
  assert_output --partial "Aborting upload process"
}

@test "prompt_user_decision returns 1 when user chooses 'A' (abort uppercase)" {
  # Simulate user input 'A'
  run bash -c "echo 'A' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_failure
  [ "$status" -eq 1 ]
  assert_output --partial "Aborting upload process"
}

# Test retry decision flow
@test "prompt_user_decision returns 2 when user chooses 'r' (retry)" {
  # Simulate user input 'r'
  run bash -c "echo 'r' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_failure
  [ "$status" -eq 2 ]
  assert_output --partial "Retrying log check"
}

@test "prompt_user_decision returns 2 when user chooses 'R' (retry uppercase)" {
  # Simulate user input 'R'
  run bash -c "echo 'R' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_failure
  [ "$status" -eq 2 ]
  assert_output --partial "Retrying log check"
}

# Test invalid input handling
@test "prompt_user_decision re-prompts on invalid input then accepts valid input" {
  # Simulate invalid input 'x' followed by valid input 'c'
  run bash -c "printf 'x\nc\n' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_success
  assert_output --partial "Invalid choice"
  assert_output --partial "Continue with next batch"
}

@test "prompt_user_decision displays all three options" {
  # Simulate user input 'c'
  run bash -c "echo 'c' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_success
  assert_output --partial "[c] Continue with next batch"
  assert_output --partial "[a] Abort upload process"
  assert_output --partial "[r] Retry log check"
}

@test "prompt_user_decision handles multiple invalid inputs before valid input" {
  # Simulate multiple invalid inputs followed by valid input
  run bash -c "printf '1\n2\n3\na\n' | ${TEST_TEMP_DIR}/test_prompt.sh"
  
  assert_failure
  [ "$status" -eq 1 ]
  # Should see multiple "Invalid choice" messages
  assert_output --partial "Invalid choice"
  assert_output --partial "Aborting upload process"
}
