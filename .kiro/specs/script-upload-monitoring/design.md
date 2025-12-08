# Design Document: Script Upload Monitoring

## Overview

This feature enhances the existing `upload-unprocessed-scripts.sh` bash script to include intelligent CloudWatch log monitoring between batch uploads. The current implementation uploads files continuously with only a 0.5-second delay, providing no visibility into whether the Lambda ingestion function is successfully processing files. This enhancement adds batch-based uploads with configurable pausing and automated log checking to detect errors early, preventing the upload of hundreds of files that may be silently failing.

The design maintains backward compatibility while adding optional monitoring capabilities that can be enabled through command-line parameters.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Upload Script (Bash)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  1. File Discovery & Filtering                            │  │
│  │     - List local JSON files                               │  │
│  │     - Query S3 for processed files                        │  │
│  │     - Filter out already processed                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  2. Batch Upload Loop                                     │  │
│  │     - Upload N files (configurable batch size)            │  │
│  │     - Track batch number and progress                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  3. Wait Period                                           │  │
│  │     - Configurable wait time (default 30s)                │  │
│  │     - Display countdown/progress                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  4. CloudWatch Log Check                                  │  │
│  │     - Query logs from last wait period                    │  │
│  │     - Parse for ERROR level messages                      │  │
│  │     - Display results to user                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  5. Error Handling & User Decision                        │  │
│  │     - If errors: prompt user (continue/abort)             │  │
│  │     - If no errors: proceed to next batch                 │  │
│  │     - Handle AWS CLI errors gracefully                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │         AWS Services                  │
        │  ┌─────────────────────────────────┐  │
        │  │  S3 Bucket                      │  │
        │  │  - Receives uploaded files      │  │
        │  │  - Triggers Lambda via S3 event │  │
        │  └─────────────────────────────────┘  │
        │                ↓                       │
        │  ┌─────────────────────────────────┐  │
        │  │  Lambda: ScriptIngestionHandler │  │
        │  │  - Processes JSON files         │  │
        │  │  - Generates embeddings         │  │
        │  │  - Writes to Knowledge Base     │  │
        │  │  - Logs to CloudWatch           │  │
        │  └─────────────────────────────────┘  │
        │                ↓                       │
        │  ┌─────────────────────────────────┐  │
        │  │  CloudWatch Logs                │  │
        │  │  Log Group:                     │  │
        │  │  /aws/lambda/                   │  │
        │  │    ScriptIngestionHandler       │  │
        │  └─────────────────────────────────┘  │
        └───────────────────────────────────────┘
```

### Design Decisions

**Decision 1: Bash Script Enhancement vs. New Tool**
- **Rationale**: Enhance the existing bash script rather than creating a new tool
- **Benefits**: 
  - Maintains familiarity for existing users
  - Leverages existing AWS CLI configuration
  - No new dependencies or installation requirements
  - Backward compatible with optional flags

**Decision 2: AWS CLI for CloudWatch Queries**
- **Rationale**: Use `aws logs filter-log-events` command instead of custom API calls
- **Benefits**:
  - No additional dependencies (AWS CLI already required)
  - Handles authentication automatically
  - Built-in retry logic and error handling
  - Consistent with existing S3 operations in the script

**Decision 3: Time-Based Log Filtering**
- **Rationale**: Query logs from the last N seconds (wait time) rather than tracking specific request IDs
- **Benefits**:
  - Simpler implementation (no need to parse S3 event IDs)
  - Catches all errors in the time window, including system-level issues
  - More resilient to Lambda cold starts and async processing
- **Trade-offs**: May capture unrelated errors if multiple upload processes run simultaneously (acceptable for single-user admin scenario)

**Decision 4: Interactive Error Handling**
- **Rationale**: Pause and prompt user when errors are detected rather than auto-aborting
- **Benefits**:
  - Allows admin to assess error severity
  - Enables continuation for non-critical errors
  - Provides learning opportunity about system behavior
  - Maintains control in the hands of the operator

**Decision 5: Configurable Parameters with Sensible Defaults**
- **Rationale**: Make batch size and wait time configurable via command-line flags
- **Defaults**: 10 files per batch, 30-second wait
- **Benefits**:
  - Adapts to different Lambda performance characteristics
  - Allows tuning based on observed throttling behavior
  - Provides escape hatch for urgent uploads (large batch, short wait)

## Components and Interfaces

### Command-Line Interface

```bash
./scripts/upload-unprocessed-scripts.sh [OPTIONS]

Options:
  --batch-size N        Number of files to upload per batch (default: 10)
  --wait-time N         Seconds to wait between batches (default: 30)
  --no-monitoring       Disable log monitoring (original behavior)
  --profile PROFILE     AWS CLI profile to use (default: cicada-deployer)
  --help                Display usage information

Examples:
  # Default behavior with monitoring
  ./scripts/upload-unprocessed-scripts.sh
  
  # Custom batch size and wait time
  ./scripts/upload-unprocessed-scripts.sh --batch-size 5 --wait-time 60
  
  # Disable monitoring for fast upload
  ./scripts/upload-unprocessed-scripts.sh --no-monitoring
```

### CloudWatch Log Query Interface

The script will use the AWS CLI `logs` commands:

```bash
# Get log group name (derived from Lambda function name)
LOG_GROUP="/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler"

# Query logs from last N seconds
aws logs filter-log-events \
  --log-group-name "${LOG_GROUP}" \
  --start-time $(($(date +%s) - ${WAIT_TIME}))000 \
  --filter-pattern "ERROR" \
  --profile "${PROFILE}" \
  --output json
```

### Error Detection Logic

```bash
# Parse CloudWatch response for ERROR messages
check_logs() {
  local start_time=$1
  local end_time=$2
  
  # Query CloudWatch logs
  local log_output=$(aws logs filter-log-events \
    --log-group-name "${LOG_GROUP}" \
    --start-time "${start_time}" \
    --end-time "${end_time}" \
    --filter-pattern "ERROR" \
    --profile "${PROFILE}" \
    --output json 2>&1)
  
  # Check for AWS CLI errors
  if [ $? -ne 0 ]; then
    echo "⚠️  Failed to query CloudWatch logs:"
    echo "${log_output}"
    return 2  # AWS CLI error
  fi
  
  # Parse JSON response
  local error_count=$(echo "${log_output}" | jq '.events | length')
  
  if [ "${error_count}" -gt 0 ]; then
    return 1  # Errors found
  else
    return 0  # No errors
  fi
}
```

## Data Models

### Script State Tracking

```bash
# Global state variables
BATCH_SIZE=10
WAIT_TIME=30
MONITORING_ENABLED=true
PROFILE="cicada-deployer"

# Runtime counters
TOTAL_UPLOADED=0
TOTAL_SKIPPED=0
TOTAL_BATCHES=0
TOTAL_ERRORS=0
CURRENT_BATCH=0

# File tracking
UNPROCESSED_FILES=()  # Array of files to upload
CURRENT_BATCH_FILES=()  # Files in current batch
```

### CloudWatch Log Event Structure

The AWS CLI returns log events in this format:

```json
{
  "events": [
    {
      "logStreamName": "2024/12/08/[$LATEST]abc123",
      "timestamp": 1702000000000,
      "message": "2024-12-08T10:30:00.000Z ERROR Error processing file: Invalid JSON format",
      "ingestionTime": 1702000001000,
      "eventId": "12345"
    }
  ],
  "searchedLogStreams": [
    {
      "logStreamName": "2024/12/08/[$LATEST]abc123",
      "searchedCompletely": true
    }
  ]
}
```

### Summary Report Structure

```bash
# Final summary displayed to user
=== Upload Summary ===
Total files uploaded: 45
Total files skipped: 123
Total batches processed: 5
Errors encountered: 2
Status: Completed successfully
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Batch size consistency
*For any* batch upload operation (except the final batch), the number of files uploaded in that batch should equal the configured batch size parameter.
**Validates: Requirements 2.3**

### Property 2: Wait time adherence
*For any* completed batch, the time elapsed between the end of the batch upload and the start of log checking should be at least the configured wait time parameter (within reasonable system timing variance of ±2 seconds).
**Validates: Requirements 2.4**

### Property 3: Log query time range accuracy
*For any* CloudWatch log query, the time range queried should cover exactly the wait period plus a small buffer (e.g., wait_time + 5 seconds) to account for clock skew and Lambda execution delays.
**Validates: Requirements 1.3**

### Property 4: Error detection completeness
*For any* CloudWatch log query result containing ERROR level messages, all error messages in the response should be displayed to the user with their timestamps.
**Validates: Requirements 1.4, 3.4**

### Property 5: File upload idempotency
*For any* file that appears in the S3 processed files list, that file should be skipped in the current upload run, regardless of batch boundaries.
**Validates: Requirements 1.1**

### Property 6: Summary accuracy
*For any* completed or aborted upload run, the sum of uploaded files and skipped files should equal the total number of JSON files discovered in the source directory.
**Validates: Requirements 6.1, 6.2**

### Property 7: User decision enforcement
*For any* error detection event where the user chooses to abort, no additional files should be uploaded after the abort decision.
**Validates: Requirements 4.4**

### Property 8: AWS CLI error handling
*For any* AWS CLI command failure (S3 or CloudWatch), the script should capture the error output and display it to the user rather than silently continuing.
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

## Error Handling

### Error Categories and Responses

**1. AWS Authentication Errors**
- **Detection**: AWS CLI returns "Unable to locate credentials" or "ExpiredToken"
- **Response**: Display clear error message with instructions to refresh credentials
- **Recovery**: Exit script with error code 1
- **User Action**: Run `aws sso login --profile cicada-deployer`

**2. CloudWatch Log Query Failures**
- **Detection**: `aws logs filter-log-events` returns non-zero exit code
- **Response**: Display error and offer options: retry, skip log check, or abort
- **Recovery**: User-driven decision
- **User Action**: Choose based on error severity

**3. S3 Upload Failures**
- **Detection**: `aws s3 cp` returns non-zero exit code
- **Response**: Display error and halt execution immediately
- **Recovery**: None (critical failure)
- **User Action**: Investigate S3 permissions or network issues

**4. Lambda Processing Errors (detected in logs)**
- **Detection**: ERROR messages in CloudWatch logs
- **Response**: Display errors with context and prompt user
- **Recovery**: User chooses to continue or abort
- **User Action**: Assess error severity and decide

**5. Invalid Command-Line Arguments**
- **Detection**: Argument parsing fails or values out of range
- **Response**: Display usage help and exit
- **Recovery**: None
- **User Action**: Correct command-line arguments

### Error Display Format

```bash
╔════════════════════════════════════════════════════════════╗
║  ⚠️  ERRORS DETECTED IN CLOUDWATCH LOGS                    ║
╚════════════════════════════════════════════════════════════╝

Time Range: 2024-12-08 10:30:00 - 10:30:30 (30 seconds)
Log Group: /aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler
Errors Found: 2

[10:30:15] ERROR: Failed to parse JSON file: onikakushi_01.json
  └─ SyntaxError: Unexpected token } in JSON at position 1234

[10:30:22] ERROR: Bedrock API throttling: Rate exceeded
  └─ ThrottlingException: Rate exceeded for model amazon.titan-embed-text-v1

────────────────────────────────────────────────────────────

What would you like to do?
  [c] Continue with next batch
  [a] Abort upload process
  [r] Retry log check
Choice:
```

### Graceful Degradation

If CloudWatch log monitoring fails repeatedly:
1. Offer to disable monitoring and continue with uploads
2. Warn user that errors won't be detected
3. Require explicit confirmation to proceed
4. Log the decision in the summary report

## Testing Strategy

### Unit Testing Approach

Since this is a bash script, traditional unit testing is challenging. Instead, we'll use:

**1. Function Isolation Tests**
- Extract key logic into testable bash functions
- Use `bats` (Bash Automated Testing System) for function-level tests
- Mock AWS CLI commands using function overrides

**2. Integration Tests**
- Test against actual AWS resources in a non-production environment
- Use small test datasets (5-10 files)
- Verify CloudWatch log queries return expected results

**3. Manual Test Scenarios**
- Happy path: All files upload successfully with no errors
- Error detection: Inject malformed JSON to trigger Lambda errors
- User abort: Verify script stops when user chooses abort
- AWS CLI failure: Test with invalid credentials
- Large dataset: Test with 100+ files to verify batch logic

### Property-Based Testing Approach

Property-based testing for bash scripts will use `bats` with generated test data:

**Test Framework**: `bats-core` with `bats-assert` and `bats-support` libraries

**Property Test 1: Batch size consistency**
- **Feature: script-upload-monitoring, Property 1: Batch size consistency**
- Generate random batch sizes (1-50)
- Generate random file counts (10-200)
- Verify each batch (except last) has exactly batch_size files
- Run 100 iterations with different combinations

**Property Test 2: Wait time adherence**
- **Feature: script-upload-monitoring, Property 2: Wait time adherence**
- Generate random wait times (5-120 seconds)
- Mock the upload and log check functions
- Measure actual time elapsed between operations
- Verify elapsed time ≥ wait_time (within ±2 second tolerance)
- Run 100 iterations

**Property Test 3: Log query time range accuracy**
- **Feature: script-upload-monitoring, Property 3: Log query time range accuracy**
- Generate random wait times
- Capture the AWS CLI command arguments
- Parse start-time and end-time parameters
- Verify (end_time - start_time) ≈ wait_time (within buffer)
- Run 100 iterations

**Property Test 4: Error detection completeness**
- **Feature: script-upload-monitoring, Property 4: Error detection completeness**
- Generate random CloudWatch responses with 0-10 errors
- Mock AWS CLI to return generated responses
- Verify all errors in response are displayed to user
- Run 100 iterations

**Property Test 5: File upload idempotency**
- **Feature: script-upload-monitoring, Property 5: File upload idempotency**
- Generate random sets of processed files
- Generate random sets of local files
- Verify no file in processed set is uploaded
- Run 100 iterations with different file sets

**Property Test 6: Summary accuracy**
- **Feature: script-upload-monitoring, Property 6: Summary accuracy**
- Generate random file sets and processed file lists
- Run upload logic (mocked)
- Verify uploaded + skipped = total files
- Run 100 iterations

**Property Test 7: User decision enforcement**
- **Feature: script-upload-monitoring, Property 7: User decision enforcement**
- Generate random batch scenarios with errors
- Mock user input to choose "abort"
- Verify no files uploaded after abort
- Run 100 iterations

**Property Test 8: AWS CLI error handling**
- **Feature: script-upload-monitoring, Property 8: AWS CLI error handling**
- Generate random AWS CLI error responses
- Mock AWS CLI to return errors
- Verify error output is captured and displayed
- Verify script doesn't continue silently
- Run 100 iterations

### Test Configuration

```bash
# bats test file structure
tests/
├── unit/
│   ├── argument-parsing.bats
│   ├── batch-logic.bats
│   ├── log-checking.bats
│   └── error-handling.bats
├── property/
│   ├── batch-consistency.bats
│   ├── timing-properties.bats
│   ├── error-detection.bats
│   └── file-tracking.bats
└── integration/
    ├── end-to-end-upload.bats
    └── cloudwatch-integration.bats
```

### Test Execution

```bash
# Run all tests
pnpm test:upload-script

# Run only unit tests
bats tests/unit/*.bats

# Run only property tests
bats tests/property/*.bats

# Run with verbose output
bats --verbose-run tests/
```

## Implementation Notes

### CloudWatch Log Group Discovery

The Lambda function name is `ScriptIngestionHandler` in the CDK stack, which creates a log group:
```
/aws/lambda/ProjectCICADADataStack-ScriptIngestionHandler<hash>
```

The script should dynamically discover the full log group name:

```bash
# Find log group by prefix
LOG_GROUP=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/" \
  --profile "${PROFILE}" \
  --output json | \
  jq -r '.logGroups[] | select(.logGroupName | contains("ScriptIngestionHandler")) | .logGroupName' | \
  head -n 1)

if [ -z "${LOG_GROUP}" ]; then
  echo "⚠️  Could not find ScriptIngestionHandler log group"
  echo "Monitoring will be disabled for this run"
  MONITORING_ENABLED=false
fi
```

### Timestamp Handling

CloudWatch uses millisecond timestamps. Bash `date` command provides seconds:

```bash
# Get current time in milliseconds
current_time_ms=$(($(date +%s) * 1000))

# Calculate start time (wait_time seconds ago)
start_time_ms=$(( current_time_ms - (WAIT_TIME * 1000) ))

# Add buffer for clock skew
end_time_ms=$(( current_time_ms + 5000 ))  # +5 seconds buffer
```

### Progress Indication

For the wait period, display a countdown:

```bash
wait_with_countdown() {
  local wait_seconds=$1
  echo -n "⏳ Waiting ${wait_seconds} seconds for Lambda processing: "
  
  for ((i=wait_seconds; i>0; i--)); do
    echo -n "${i}..."
    sleep 1
  done
  
  echo " Done!"
}
```

### Backward Compatibility

The script maintains backward compatibility:
- Default behavior includes monitoring (new feature)
- `--no-monitoring` flag restores original behavior
- All existing environment variables and AWS profile usage unchanged
- Exit codes remain consistent

### Performance Considerations

- **CloudWatch API Costs**: Each log query costs ~$0.005 per GB scanned. With typical Lambda logs, this is negligible (<$0.01 per run)
- **Script Execution Time**: With default settings (10 files/batch, 30s wait), uploading 100 files takes ~5 minutes (vs. ~1 minute without monitoring)
- **Trade-off**: Slower uploads but early error detection prevents wasted time uploading files that will fail

## Security Considerations

- **AWS Credentials**: Script uses existing AWS CLI profile configuration (no new credential storage)
- **Log Data Exposure**: CloudWatch logs may contain sensitive data; script only displays ERROR messages
- **Permissions Required**:
  - `s3:ListBucket` on script data bucket
  - `s3:PutObject` on script data bucket
  - `logs:DescribeLogGroups` for log group discovery
  - `logs:FilterLogEvents` for log querying
- **No New Attack Surface**: Script doesn't expose new endpoints or store credentials

## Future Enhancements

1. **Structured Logging**: Parse Lambda logs for structured JSON errors with better formatting
2. **Metrics Dashboard**: Optionally push upload metrics to CloudWatch for tracking over time
3. **Parallel Uploads**: Upload files in parallel within a batch for faster processing
4. **Retry Logic**: Automatically retry failed uploads with exponential backoff
5. **Email Notifications**: Send summary report via SNS/SES when upload completes
6. **Dry Run Mode**: Preview what would be uploaded without actually uploading
7. **Resume Capability**: Save progress and resume from last successful batch after abort
