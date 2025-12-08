#!/usr/bin/env bats

# Smoke test to verify BATS testing infrastructure is working correctly

load '../helpers/test_helper'

setup() {
  setup_test_environment
}

teardown() {
  cleanup_test_environment
}

@test "bats-core is installed and working" {
  run echo "Hello from BATS"
  assert_success
  assert_output "Hello from BATS"
}

@test "bats-assert library is loaded" {
  run echo "test"
  assert_success
  assert_output "test"
}

@test "bats-support library is loaded" {
  # Test that support functions are available
  run echo "support test"
  assert_success
}

@test "test environment setup creates temp directory" {
  assert [ -d "${TEST_TEMP_DIR}" ]
  assert [ -d "${MOCK_BIN_DIR}" ]
}

@test "mock AWS CLI command works" {
  mock_aws_command "s3 ls" "test-bucket"
  
  run aws s3 ls
  assert_success
  assert_output "test-bucket"
}

@test "create sample JSON file works" {
  create_sample_json "test.json" '{"test": "data"}'
  
  assert_file_exists "${TEST_TEMP_DIR}/test.json"
  
  # Just verify the file exists and is readable
  run cat "${TEST_TEMP_DIR}/test.json"
  assert_success
  assert_output_contains "test"
  assert_output_contains "data"
}

@test "random string generator works" {
  result=$(random_string 10)
  
  # Check length is 10
  assert [ ${#result} -eq 10 ]
}

@test "random number generator works" {
  result=$(random_number 1 10)
  
  # Check result is between 1 and 10
  assert [ "${result}" -ge 1 ]
  assert [ "${result}" -le 10 ]
}

@test "assert_output_contains helper works" {
  output="This is a test message"
  
  run assert_output_contains "test"
  assert_success
}

@test "assert_output_not_contains helper works" {
  output="This is a test message"
  
  run assert_output_not_contains "foobar"
  assert_success
}
