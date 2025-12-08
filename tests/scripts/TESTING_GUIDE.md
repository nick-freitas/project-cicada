# Bash Script Testing Guide

This guide explains how to write and run tests for bash scripts in the CICADA project.

## Overview

We use **BATS (Bash Automated Testing System)** for testing bash scripts. BATS provides a simple, TAP-compliant testing framework specifically designed for bash scripts.

## Test Structure

```
tests/scripts/
├── unit/              # Unit tests for individual functions
├── property/          # Property-based tests (100+ iterations)
├── integration/       # Integration tests with AWS services
├── fixtures/          # Test data
│   ├── json/         # Sample JSON script files
│   └── responses/    # Mock AWS CLI responses
└── helpers/          # Test utilities
    └── test_helper.bash  # Common functions and mocks
```

## Running Tests

### All Script Tests
```bash
pnpm test:scripts
```

### Unit Tests Only
```bash
pnpm test:scripts:unit
```

### Property Tests Only
```bash
pnpm test:scripts:property
```

### Integration Tests Only
```bash
pnpm test:scripts:integration
```

### Single Test File
```bash
npx bats tests/scripts/unit/argument-parsing.bats
```

### Verbose Output
```bash
npx bats --verbose-run tests/scripts/unit/*.bats
```

## Writing Tests

### Basic Test Structure

```bash
#!/usr/bin/env bats

# Load test helper
load '../helpers/test_helper'

# Setup runs before each test
setup() {
  setup_test_environment
}

# Teardown runs after each test
teardown() {
  cleanup_test_environment
}

# Test case
@test "description of what is being tested" {
  # Arrange: Set up test data
  create_sample_json "test.json"
  
  # Act: Run the command
  run some_command "test.json"
  
  # Assert: Verify results
  assert_success
  assert_output "expected output"
}
```

### Available Assertions

From **bats-assert**:
- `assert_success` - Command exited with status 0
- `assert_failure` - Command exited with non-zero status
- `assert_output "text"` - Output exactly matches
- `assert_line "text"` - At least one line matches
- `assert_equal "expected" "actual"` - Values are equal

From **test_helper.bash**:
- `assert_file_exists "path"` - File exists
- `assert_file_not_exists "path"` - File does not exist
- `assert_output_contains "substring"` - Output contains substring
- `assert_output_not_contains "substring"` - Output doesn't contain substring

### Mocking AWS CLI

The test helper provides functions to mock AWS CLI commands:

#### Mock S3 List Command
```bash
@test "list processed files" {
  # Mock S3 ls to return specific files
  mock_aws_s3_ls "2024-12-08 10:00:00    1234 processed/file1.json
2024-12-08 10:01:00    2345 processed/file2.json"
  
  run aws s3 ls s3://bucket/processed/
  assert_success
  assert_output_contains "file1.json"
}
```

#### Mock S3 Copy Command
```bash
@test "upload file to S3" {
  # Mock S3 cp to succeed
  mock_aws_s3_cp 0
  
  run aws s3 cp test.json s3://bucket/test.json
  assert_success
}
```

#### Mock CloudWatch Logs
```bash
@test "query CloudWatch logs" {
  # Mock logs query with no errors
  mock_aws_logs_filter_events '{"events": []}'
  
  run aws logs filter-log-events --log-group-name "/aws/lambda/test"
  assert_success
  assert_output_contains '"events"'
}
```

#### Mock AWS CLI Errors
```bash
@test "handle authentication error" {
  # Mock AWS CLI to return error
  mock_aws_error "InvalidCredentials" 255
  
  run aws s3 ls
  assert_failure
  assert_output_contains "InvalidCredentials"
}
```

### Using Test Fixtures

#### Sample JSON Files
```bash
@test "process sample script file" {
  # Use pre-created fixture
  local fixture="${BATS_TEST_DIRNAME}/../fixtures/json/sample_script_1.json"
  
  run process_script "${fixture}"
  assert_success
}
```

#### Mock CloudWatch Responses
```bash
@test "parse CloudWatch response with errors" {
  # Load fixture response
  local response=$(cat "${BATS_TEST_DIRNAME}/../fixtures/responses/cloudwatch_with_errors.json")
  
  mock_aws_logs_filter_events "${response}"
  
  run check_for_errors
  assert_failure
  assert_output_contains "ERROR"
}
```

### Creating Test Data

#### Generate Sample JSON Files
```bash
@test "upload multiple files" {
  # Create 10 sample JSON files
  create_sample_json_files 10
  
  # Files are created in TEST_TEMP_DIR
  assert_file_exists "${TEST_TEMP_DIR}/test_file_1.json"
  assert_file_exists "${TEST_TEMP_DIR}/test_file_10.json"
}
```

#### Generate Random Data
```bash
@test "handle random batch sizes" {
  # Generate random batch size between 1 and 50
  local batch_size=$(random_number 1 50)
  
  run process_batch "${batch_size}"
  assert_success
}
```

## Property-Based Testing

Property-based tests verify that properties hold across many randomly generated inputs.

### Example Property Test

```bash
#!/usr/bin/env bats

load '../helpers/test_helper'

setup() {
  setup_test_environment
}

teardown() {
  cleanup_test_environment
}

# **Feature: script-upload-monitoring, Property 1: Batch size consistency**
# **Validates: Requirements 2.3**
@test "batch size consistency - 100 iterations" {
  for i in {1..100}; do
    # Generate random batch size
    local batch_size=$(random_number 1 50)
    
    # Generate random file count
    local file_count=$(random_number 10 200)
    
    # Create test files
    create_sample_json_files "${file_count}"
    
    # Run batch upload (mocked)
    run upload_in_batches "${batch_size}" "${TEST_TEMP_DIR}"
    
    # Verify: Each batch (except last) has exactly batch_size files
    # Implementation depends on how batches are tracked
    assert_success
  done
}
```

### Property Test Guidelines

1. **Run 100+ iterations** - Property tests should run many times with random inputs
2. **Tag with property reference** - Include comment with feature name and property number
3. **Validate requirements** - Include comment linking to requirements document
4. **Use random generators** - Use `random_number` and `random_string` helpers
5. **Test invariants** - Verify properties that should always hold

## Integration Testing

Integration tests interact with real AWS services (in non-production environment).

### Example Integration Test

```bash
#!/usr/bin/env bats

load '../helpers/test_helper'

setup() {
  # Use real AWS CLI, not mocks
  export AWS_PROFILE="cicada-deployer-nonprod"
  export TEST_BUCKET="test-bucket-nonprod"
}

@test "upload and verify file in S3" {
  # Create test file
  local test_file="integration_test_$(random_string 8).json"
  create_sample_json "${test_file}"
  
  # Upload to real S3
  run aws s3 cp "${TEST_TEMP_DIR}/${test_file}" "s3://${TEST_BUCKET}/${test_file}"
  assert_success
  
  # Verify file exists
  run aws s3 ls "s3://${TEST_BUCKET}/${test_file}"
  assert_success
  assert_output_contains "${test_file}"
  
  # Cleanup
  aws s3 rm "s3://${TEST_BUCKET}/${test_file}"
}
```

### Integration Test Guidelines

1. **Use non-production environment** - Never test against production
2. **Clean up resources** - Always delete test data after test
3. **Handle AWS credentials** - Ensure proper AWS profile is configured
4. **Test real behavior** - Verify actual AWS service interactions
5. **Be mindful of costs** - Keep tests minimal to avoid AWS charges

## Debugging Tests

### Print Debug Information
```bash
@test "debug test" {
  # Print to stderr (visible in test output)
  echo "Debug: TEST_TEMP_DIR=${TEST_TEMP_DIR}" >&2
  
  run some_command
  
  # Print command output
  echo "Output: ${output}" >&2
  echo "Status: ${status}" >&2
}
```

### Run Single Test
```bash
# Run only one test by name
npx bats --filter "description of test" tests/scripts/unit/file.bats
```

### Verbose Mode
```bash
# Show all output including passing tests
npx bats --verbose-run tests/scripts/unit/file.bats
```

## Best Practices

1. **One assertion per test** - Keep tests focused and simple
2. **Use descriptive test names** - Test name should explain what is being tested
3. **Clean up after tests** - Use teardown to remove temporary files
4. **Mock external dependencies** - Don't rely on real AWS services in unit tests
5. **Test edge cases** - Include tests for empty inputs, large inputs, errors
6. **Keep tests fast** - Unit tests should run in milliseconds
7. **Make tests deterministic** - Tests should always produce same result
8. **Document complex tests** - Add comments explaining non-obvious test logic

## Common Patterns

### Testing Command-Line Arguments
```bash
@test "parse batch size argument" {
  run parse_arguments --batch-size 20
  assert_success
  assert_equal "${BATCH_SIZE}" "20"
}
```

### Testing Error Handling
```bash
@test "handle invalid batch size" {
  run parse_arguments --batch-size -5
  assert_failure
  assert_output_contains "Batch size must be positive"
}
```

### Testing File Processing
```bash
@test "skip already processed files" {
  # Mock S3 to show file is processed
  mock_aws_s3_ls "processed/test.json"
  
  # Create local file
  create_sample_json "test.json"
  
  run should_upload_file "test.json"
  assert_failure  # Should not upload
}
```

### Testing Timing
```bash
@test "wait for specified duration" {
  local start=$(date +%s)
  
  run wait_with_countdown 5
  
  local end=$(date +%s)
  local elapsed=$((end - start))
  
  # Allow 2 second tolerance
  assert [ "${elapsed}" -ge 3 ]
  assert [ "${elapsed}" -le 7 ]
}
```

## Troubleshooting

### Tests Not Found
```bash
# Make sure test files are executable
chmod +x tests/scripts/unit/*.bats
```

### Mock Not Working
```bash
# Verify mock bin is in PATH
echo $PATH | grep "${MOCK_BIN_DIR}"

# Check mock script exists and is executable
ls -la "${MOCK_BIN_DIR}/aws"
```

### Cleanup Not Running
```bash
# Ensure teardown is defined
teardown() {
  cleanup_test_environment
}
```

### Random Failures
```bash
# Check for race conditions or timing issues
# Add explicit waits or increase tolerances
```

## Resources

- [BATS Documentation](https://bats-core.readthedocs.io/)
- [bats-assert Library](https://github.com/bats-core/bats-assert)
- [bats-support Library](https://github.com/bats-core/bats-support)
- [Property-Based Testing Guide](https://hypothesis.works/articles/what-is-property-based-testing/)
