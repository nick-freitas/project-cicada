# Requirements Document

## Introduction

This feature enhances the existing script upload process to include CloudWatch log monitoring between batch uploads. Currently, the `upload-unprocessed-scripts.sh` script uploads files to S3 without checking if the Lambda ingestion function is processing them successfully. This enhancement will add intelligent monitoring to detect errors early and prevent uploading files that are silently failing.

## Glossary

- **Upload Script**: The bash script (`upload-unprocessed-scripts.sh`) that uploads Higurashi script JSON files to S3
- **Ingestion Lambda**: The AWS Lambda function (`ScriptIngestionHandler`) that processes uploaded script files
- **CloudWatch Logs**: AWS service that stores Lambda function execution logs
- **Log Group**: A collection of log streams in CloudWatch for a specific Lambda function
- **Batch Upload**: Uploading a subset of files (e.g., 10 files) before pausing
- **Throttling**: Rate limiting that occurs when too many requests are made too quickly
- **Silent Failure**: When a process fails without visible error messages to the user

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to upload script files in controlled batches with monitoring, so that I can detect and respond to processing errors before uploading all files.

#### Acceptance Criteria

1. WHEN the upload script starts THEN the system SHALL identify the correct CloudWatch log group for the ingestion Lambda function
2. WHEN a batch of files is uploaded THEN the system SHALL wait a configurable duration before checking logs
3. WHEN checking logs THEN the system SHALL retrieve recent log entries from the ingestion Lambda's CloudWatch log group
4. WHEN log entries contain ERROR level messages THEN the system SHALL display the errors to the user and pause execution
5. WHEN log entries contain no errors THEN the system SHALL proceed to upload the next batch

### Requirement 2

**User Story:** As a system administrator, I want configurable batch sizes and wait times, so that I can adjust the upload rate based on system performance and throttling limits.

#### Acceptance Criteria

1. WHEN the upload script is invoked THEN the system SHALL accept a batch size parameter with a default value of 10 files
2. WHEN the upload script is invoked THEN the system SHALL accept a wait time parameter with a default value of 30 seconds
3. WHEN processing files THEN the system SHALL upload files in groups matching the batch size parameter
4. WHEN a batch completes THEN the system SHALL wait for the duration specified by the wait time parameter before checking logs

### Requirement 3

**User Story:** As a system administrator, I want clear visibility into upload progress and log check results, so that I can understand what the system is doing and make informed decisions.

#### Acceptance Criteria

1. WHEN a batch upload starts THEN the system SHALL display the batch number and file count
2. WHEN waiting between batches THEN the system SHALL display a countdown or progress indicator
3. WHEN checking CloudWatch logs THEN the system SHALL display the time range being checked
4. WHEN errors are found THEN the system SHALL display the error messages with timestamps and context
5. WHEN no errors are found THEN the system SHALL display a success message with the number of log entries checked

### Requirement 4

**User Story:** As a system administrator, I want the option to continue or abort when errors are detected, so that I can make informed decisions about whether to proceed with uploads.

#### Acceptance Criteria

1. WHEN errors are detected in CloudWatch logs THEN the system SHALL pause and display the errors
2. WHEN paused due to errors THEN the system SHALL prompt the user with options to continue or abort
3. WHEN the user chooses to continue THEN the system SHALL proceed with the next batch upload
4. WHEN the user chooses to abort THEN the system SHALL exit gracefully and display a summary of completed uploads

### Requirement 5

**User Story:** As a system administrator, I want the script to handle AWS CLI errors gracefully, so that temporary network issues or permission problems don't cause silent failures.

#### Acceptance Criteria

1. WHEN AWS CLI commands fail THEN the system SHALL capture the error output
2. WHEN CloudWatch log retrieval fails THEN the system SHALL display the error and offer to retry or skip log checking
3. WHEN S3 upload commands fail THEN the system SHALL display the error and halt execution
4. WHEN AWS credentials are invalid or expired THEN the system SHALL display a clear error message about authentication

### Requirement 6

**User Story:** As a system administrator, I want a summary report at the end of the upload process, so that I can verify what was accomplished and identify any issues.

#### Acceptance Criteria

1. WHEN the upload script completes THEN the system SHALL display the total number of files uploaded
2. WHEN the upload script completes THEN the system SHALL display the total number of files skipped
3. WHEN the upload script completes THEN the system SHALL display the number of batches processed
4. WHEN the upload script completes THEN the system SHALL display the number of errors encountered during log checks
5. WHEN the upload script is aborted THEN the system SHALL display a partial summary of work completed before abortion
