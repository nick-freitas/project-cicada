# Bash Script Tests

This directory contains tests for bash scripts using the BATS (Bash Automated Testing System) framework.

## Structure

```
tests/scripts/
├── unit/              # Unit tests for individual functions
├── property/          # Property-based tests
├── integration/       # Integration tests with AWS services
├── fixtures/          # Test data fixtures
│   ├── json/         # Sample JSON files
│   └── responses/    # Mock AWS CLI responses
└── helpers/          # Test helper functions
    └── test_helper.bash  # Common test utilities and mocks
```

## Running Tests

```bash
# Run all script tests
pnpm test:scripts

# Run specific test file
bats tests/scripts/unit/argument-parsing.bats

# Run with verbose output
bats --verbose-run tests/scripts/unit/*.bats

# Run property tests
bats tests/scripts/property/*.bats
```

## Test Framework

- **bats-core**: Main testing framework
- **bats-assert**: Assertion helpers
- **bats-support**: Additional test utilities

## Writing Tests

Example test structure:

```bash
#!/usr/bin/env bats

load '../helpers/test_helper'

setup() {
  # Setup before each test
  setup_test_environment
}

teardown() {
  # Cleanup after each test
  cleanup_test_environment
}

@test "description of test" {
  # Test implementation
  run some_command
  assert_success
  assert_output "expected output"
}
```

## Mocking AWS CLI

The test helper provides functions to mock AWS CLI commands:

```bash
# Mock S3 list command
mock_aws_s3_ls "file1.json\nfile2.json"

# Mock CloudWatch logs query
mock_aws_logs_filter_events '{"events": []}'

# Mock AWS CLI error
mock_aws_error "InvalidCredentials"
```
