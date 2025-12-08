# Implementation Plan: Script Upload Monitoring

- [x] 1. Set up testing infrastructure
  - Create `tests/` directory structure for bash script tests
  - Install and configure `bats-core`, `bats-assert`, and `bats-support` libraries
  - Create test helper functions for mocking AWS CLI commands
  - Set up test data fixtures (sample JSON files, mock CloudWatch responses)
  - _Requirements: All (testing foundation)_

- [x] 2. Implement command-line argument parsing
  - Add argument parsing logic for `--batch-size`, `--wait-time`, `--no-monitoring`, `--profile`, `--help`
  - Validate argument values (batch-size > 0, wait-time > 0)
  - Set default values (batch-size=10, wait-time=30, monitoring=true, profile=cicada-deployer)
  - Implement `--help` flag to display usage information
  - _Requirements: 2.1, 2.2_

- [x] 2.1 Write property test for argument parsing
  - **Property 1: Batch size consistency**
  - **Validates: Requirements 2.3**

- [x] 3. Implement CloudWatch log group discovery
  - Add function to query AWS for log groups matching "ScriptIngestionHandler"
  - Handle case where log group is not found (disable monitoring gracefully)
  - Cache log group name for reuse across batches
  - Display discovered log group name to user for transparency
  - _Requirements: 1.1_

- [x] 3.1 Write unit tests for log group discovery
  - Test successful discovery with mock AWS CLI response
  - Test handling of missing log group
  - Test handling of multiple matching log groups (use first)
  - _Requirements: 1.1_

- [x] 4. Implement batch upload logic
  - Refactor existing upload loop to process files in batches
  - Track current batch number and files per batch
  - Display batch progress (e.g., "Batch 3/10: Uploading 10 files...")
  - Handle final batch with fewer than batch-size files
  - Maintain existing file filtering logic (skip processed files)
  - _Requirements: 1.2, 2.3, 3.1_

- [x] 4.1 Write property test for batch size consistency
  - **Property 1: Batch size consistency**
  - **Validates: Requirements 2.3**

- [x] 4.2 Write property test for file upload idempotency
  - **Property 5: File upload idempotency**
  - **Validates: Requirements 1.1**

- [x] 5. Implement wait period with progress indication
  - Create `wait_with_countdown()` function that displays countdown timer
  - Use configurable wait time parameter
  - Display clear progress indicator (e.g., "⏳ Waiting 30 seconds: 30...29...28...")
  - _Requirements: 1.2, 2.4, 3.2_

- [x] 5.1 Write property test for wait time adherence
  - **Property 2: Wait time adherence**
  - **Validates: Requirements 2.4**

- [x] 6. Implement CloudWatch log querying
  - Create `check_logs()` function to query CloudWatch logs
  - Calculate correct timestamp range (milliseconds) from wait period
  - Use `aws logs filter-log-events` with ERROR filter pattern
  - Parse JSON response to extract error events
  - Handle AWS CLI errors gracefully (network issues, permissions)
  - _Requirements: 1.3, 3.3_

- [x] 6.1 Write property test for log query time range accuracy
  - **Property 3: Log query time range accuracy**
  - **Validates: Requirements 1.3**

- [x] 6.2 Write unit tests for CloudWatch querying
  - Test successful query with no errors
  - Test successful query with multiple errors
  - Test handling of AWS CLI failures
  - Test timestamp calculation accuracy
  - _Requirements: 1.3, 5.2_

- [x] 7. Implement error detection and display
  - Parse CloudWatch response for ERROR messages
  - Extract timestamp, log stream, and error message from each event
  - Format errors in user-friendly display with box drawing characters
  - Display time range checked and number of errors found
  - Show full error context including stack traces if present
  - _Requirements: 1.4, 3.4_

- [x] 7.1 Write property test for error detection completeness
  - **Property 4: Error detection completeness**
  - **Validates: Requirements 1.4, 3.4**

- [x] 8. Implement user decision prompting
  - Create `prompt_user_decision()` function for error scenarios
  - Display options: [c]ontinue, [a]bort, [r]etry log check
  - Read and validate user input
  - Return decision code for main loop to process
  - Handle invalid input with re-prompting
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8.1 Write property test for user decision enforcement
  - **Property 7: User decision enforcement**
  - **Validates: Requirements 4.4**

- [x] 8.2 Write unit tests for user prompting
  - Test continue decision flow
  - Test abort decision flow
  - Test retry decision flow
  - Test invalid input handling
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 9. Implement comprehensive error handling
  - Add error handling for AWS authentication failures
  - Add error handling for S3 upload failures (halt immediately)
  - Add error handling for CloudWatch query failures (offer retry/skip/abort)
  - Display clear error messages with actionable guidance
  - Set appropriate exit codes for different error types
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 9.1 Write property test for AWS CLI error handling
  - **Property 8: AWS CLI error handling**
  - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 9.2 Write unit tests for error handling
  - Test authentication error detection and messaging
  - Test S3 upload failure handling
  - Test CloudWatch query failure handling
  - Test graceful degradation when monitoring fails
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 10. Implement summary reporting
  - Track counters: total uploaded, total skipped, total batches, total errors
  - Create `display_summary()` function to format final report
  - Display summary on successful completion
  - Display partial summary on abort
  - Include all required metrics in summary
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 10.1 Write property test for summary accuracy
  - **Property 6: Summary accuracy**
  - **Validates: Requirements 6.1, 6.2**

- [ ] 10.2 Write unit tests for summary reporting
  - Test summary with successful completion
  - Test summary with abort
  - Test counter accuracy
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 11. Implement backward compatibility mode
  - Add `--no-monitoring` flag to disable all monitoring features
  - Restore original behavior when monitoring is disabled
  - Ensure all existing functionality works unchanged
  - Test that exit codes remain consistent
  - _Requirements: All (backward compatibility)_

- [ ] 11.1 Write integration tests for backward compatibility
  - Test original behavior with `--no-monitoring` flag
  - Verify exit codes match original script
  - Verify output format matches original script
  - _Requirements: All (backward compatibility)_

- [ ] 12. Add comprehensive logging and debugging
  - Add verbose mode flag (`--verbose`) for debugging
  - Log all AWS CLI commands when verbose mode enabled
  - Log timestamp calculations and batch boundaries
  - Add debug output for log query results
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 13. Update documentation
  - Update script header comments with new usage information
  - Document all command-line flags and their defaults
  - Add examples for common use cases
  - Document required AWS permissions
  - Create troubleshooting guide for common errors
  - _Requirements: All (documentation)_

- [ ] 14. Checkpoint - Integration testing
  - Run full integration test with small dataset (10 files)
  - Test happy path: all files upload successfully
  - Test error detection: inject malformed JSON to trigger errors
  - Test user abort: verify script stops correctly
  - Test AWS CLI failure scenarios
  - Verify all counters and summary are accurate
  - Ensure all tests pass, ask the user if questions arise

- [ ] 15. Performance optimization
  - Optimize CloudWatch query to minimize data scanned
  - Add option to skip log checking for final batch
  - Consider parallel uploads within batch (future enhancement)
  - Profile script execution time with different batch sizes
  - _Requirements: 2.3, 2.4_

- [ ] 15.1 Write performance tests
  - Test script performance with various batch sizes
  - Test CloudWatch query performance
  - Measure total execution time for 100 files
  - _Requirements: 2.3, 2.4_

- [ ] 16. Final checkpoint - End-to-end validation
  - Run complete upload with full dataset (500+ files)
  - Verify monitoring works correctly across many batches
  - Test with different batch sizes and wait times
  - Verify error detection and user prompting work correctly
  - Confirm summary report is accurate
  - Ensure all tests pass, ask the user if questions arise
