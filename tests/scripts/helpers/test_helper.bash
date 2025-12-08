#!/usr/bin/env bash

# Test helper functions for bash script testing
# Provides utilities for mocking AWS CLI commands and setting up test environments

# Load bats libraries
load "${BATS_TEST_DIRNAME}/../../../node_modules/bats-support/load.bash"
load "${BATS_TEST_DIRNAME}/../../../node_modules/bats-assert/load.bash"

# Test environment variables
export TEST_TEMP_DIR=""
export MOCK_AWS_RESPONSES_DIR=""
export ORIGINAL_PATH="${PATH}"

# Setup test environment
setup_test_environment() {
  # Create temporary directory for test files
  TEST_TEMP_DIR="$(mktemp -d)"
  MOCK_AWS_RESPONSES_DIR="${TEST_TEMP_DIR}/mock_responses"
  mkdir -p "${MOCK_AWS_RESPONSES_DIR}"
  
  # Create mock bin directory for AWS CLI
  export MOCK_BIN_DIR="${TEST_TEMP_DIR}/bin"
  mkdir -p "${MOCK_BIN_DIR}"
  
  # Prepend mock bin to PATH so our mock aws command is found first
  export PATH="${MOCK_BIN_DIR}:${ORIGINAL_PATH}"
  
  # Set test AWS profile
  export AWS_PROFILE="test-profile"
  export AWS_DEFAULT_REGION="us-east-1"
}

# Cleanup test environment
cleanup_test_environment() {
  # Restore original PATH
  export PATH="${ORIGINAL_PATH}"
  
  # Remove temporary directory
  if [ -n "${TEST_TEMP_DIR}" ] && [ -d "${TEST_TEMP_DIR}" ]; then
    rm -rf "${TEST_TEMP_DIR}"
  fi
}

# Mock AWS CLI command
# Usage: mock_aws_command "s3 ls" "output" [exit_code]
mock_aws_command() {
  local command_pattern="$1"
  local output="$2"
  local exit_code="${3:-0}"
  
  # Create mock aws script
  cat > "${MOCK_BIN_DIR}/aws" << EOF
#!/usr/bin/env bash
# Mock AWS CLI command

# Check if command matches pattern
if [[ "\$*" == *"${command_pattern}"* ]]; then
  echo "${output}"
  exit ${exit_code}
fi

# Default: call real aws if available
if command -v /usr/local/bin/aws &> /dev/null; then
  /usr/local/bin/aws "\$@"
else
  echo "Error: AWS CLI not found" >&2
  exit 1
fi
EOF
  
  chmod +x "${MOCK_BIN_DIR}/aws"
}

# Mock AWS S3 ls command
# Usage: mock_aws_s3_ls "file1.json\nfile2.json"
mock_aws_s3_ls() {
  local output="$1"
  local exit_code="${2:-0}"
  
  cat > "${MOCK_BIN_DIR}/aws" << EOF
#!/usr/bin/env bash
if [[ "\$*" == *"s3 ls"* ]]; then
  echo -e "${output}"
  exit ${exit_code}
fi
echo "Unexpected AWS command: \$*" >&2
exit 1
EOF
  
  chmod +x "${MOCK_BIN_DIR}/aws"
}

# Mock AWS S3 cp command
# Usage: mock_aws_s3_cp [exit_code]
mock_aws_s3_cp() {
  local exit_code="${1:-0}"
  
  cat > "${MOCK_BIN_DIR}/aws" << EOF
#!/usr/bin/env bash
if [[ "\$*" == *"s3 cp"* ]]; then
  # Extract filename from command
  filename=\$(echo "\$*" | grep -o '[^ ]*\.json' | head -1)
  echo "upload: \${filename} to s3://bucket/\${filename}"
  exit ${exit_code}
fi
echo "Unexpected AWS command: \$*" >&2
exit 1
EOF
  
  chmod +x "${MOCK_BIN_DIR}/aws"
}

# Mock AWS CloudWatch logs describe-log-groups command
# Usage: mock_aws_logs_describe_log_groups '{"logGroups": [...]}'
mock_aws_logs_describe_log_groups() {
  local json_output="$1"
  local exit_code="${2:-0}"
  
  cat > "${MOCK_BIN_DIR}/aws" << EOF
#!/usr/bin/env bash
if [[ "\$*" == *"logs describe-log-groups"* ]]; then
  echo '${json_output}'
  exit ${exit_code}
fi
echo "Unexpected AWS command: \$*" >&2
exit 1
EOF
  
  chmod +x "${MOCK_BIN_DIR}/aws"
}

# Mock AWS CloudWatch logs filter-log-events command
# Usage: mock_aws_logs_filter_events '{"events": [...]}'
mock_aws_logs_filter_events() {
  local json_output="$1"
  local exit_code="${2:-0}"
  
  # Write JSON to a temp file to avoid escaping issues
  local json_file="${MOCK_AWS_RESPONSES_DIR}/filter_events_response.json"
  echo "${json_output}" > "${json_file}"
  
  cat > "${MOCK_BIN_DIR}/aws" << EOF
#!/usr/bin/env bash
if [[ "\$*" == *"logs filter-log-events"* ]]; then
  cat "${json_file}"
  exit ${exit_code}
fi
echo "Unexpected AWS command: \$*" >&2
exit 1
EOF
  
  chmod +x "${MOCK_BIN_DIR}/aws"
}

# Mock AWS CLI error
# Usage: mock_aws_error "InvalidCredentials" [exit_code]
mock_aws_error() {
  local error_message="$1"
  local exit_code="${2:-255}"
  
  cat > "${MOCK_BIN_DIR}/aws" << EOF
#!/usr/bin/env bash
echo "An error occurred (${error_message}): ${error_message}" >&2
exit ${exit_code}
EOF
  
  chmod +x "${MOCK_BIN_DIR}/aws"
}

# Create sample JSON file
# Usage: create_sample_json "filename.json" [content]
create_sample_json() {
  local filename="$1"
  local content="${2:-{\"test\": \"data\"}}"
  
  printf '%s' "${content}" > "${TEST_TEMP_DIR}/${filename}"
}

# Create multiple sample JSON files
# Usage: create_sample_json_files 10
create_sample_json_files() {
  local count="$1"
  
  for i in $(seq 1 "${count}"); do
    create_sample_json "test_file_${i}.json" "{\"id\": ${i}, \"name\": \"test${i}\"}"
  done
}

# Assert file exists
# Usage: assert_file_exists "path/to/file"
assert_file_exists() {
  local file="$1"
  
  if [ ! -f "${file}" ]; then
    echo "Expected file to exist: ${file}" >&2
    return 1
  fi
}

# Assert file does not exist
# Usage: assert_file_not_exists "path/to/file"
assert_file_not_exists() {
  local file="$1"
  
  if [ -f "${file}" ]; then
    echo "Expected file to not exist: ${file}" >&2
    return 1
  fi
}

# Assert output contains
# Usage: assert_output_contains "expected substring"
assert_output_contains() {
  local expected="$1"
  
  if [[ ! "${output}" == *"${expected}"* ]]; then
    echo "Expected output to contain: ${expected}" >&2
    echo "Actual output: ${output}" >&2
    return 1
  fi
}

# Assert output does not contain
# Usage: assert_output_not_contains "unexpected substring"
assert_output_not_contains() {
  local unexpected="$1"
  
  if [[ "${output}" == *"${unexpected}"* ]]; then
    echo "Expected output to not contain: ${unexpected}" >&2
    echo "Actual output: ${output}" >&2
    return 1
  fi
}

# Generate random string
# Usage: random_string [length]
random_string() {
  local length="${1:-10}"
  LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "${length}"
}

# Generate random number
# Usage: random_number [min] [max]
random_number() {
  local min="${1:-1}"
  local max="${2:-100}"
  echo $((min + RANDOM % (max - min + 1)))
}
