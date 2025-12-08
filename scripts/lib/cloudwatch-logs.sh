#!/bin/bash

# CloudWatch Logs querying library
# Provides functions for querying CloudWatch logs and detecting errors

# Global variable to store the log group name (set by log-group-discovery.sh)
# LOG_GROUP should be set before calling check_logs()

# Check CloudWatch logs for errors in a given time range
# Usage: check_logs START_TIME_MS END_TIME_MS
# Returns:
#   0 - No errors found
#   1 - Errors found
#   2 - AWS CLI error (network, permissions, etc.)
check_logs() {
  local start_time_ms="$1"
  local end_time_ms="$2"
  
  # Validate inputs
  if [[ -z "${start_time_ms}" ]] || [[ -z "${end_time_ms}" ]]; then
    echo "Error: check_logs requires start and end timestamps" >&2
    return 2
  fi
  
  if [[ -z "${LOG_GROUP}" ]]; then
    echo "Error: LOG_GROUP not set. Call discover_log_group first." >&2
    return 2
  fi
  
  # Query CloudWatch logs
  local log_output
  log_output=$(aws logs filter-log-events \
    --log-group-name "${LOG_GROUP}" \
    --start-time "${start_time_ms}" \
    --end-time "${end_time_ms}" \
    --filter-pattern "ERROR" \
    --profile "${PROFILE}" \
    --output json 2>&1)
  
  local aws_exit_code=$?
  
  # Check for AWS CLI errors
  if [[ ${aws_exit_code} -ne 0 ]]; then
    # Store error output for error handler
    LAST_LOG_OUTPUT="${log_output}"
    return 2
  fi
  
  # Parse JSON response to count errors
  local error_count
  error_count=$(echo "${log_output}" | jq -r '.events | length' 2>/dev/null)
  local jq_exit_code=$?
  
  # Check if jq parsing failed or returned empty
  if [[ ${jq_exit_code} -ne 0 ]]; then
    echo "⚠️  Failed to parse CloudWatch response (jq error)" >&2
    return 2
  fi
  
  if [[ -z "${error_count}" ]] || [[ "${error_count}" == "null" ]]; then
    echo "⚠️  Failed to parse CloudWatch response (empty result)" >&2
    return 2
  fi
  
  # Store the log output for later display (use global variables for bash compatibility)
  LAST_LOG_OUTPUT="${log_output}"
  LAST_ERROR_COUNT="${error_count}"
  
  if [[ ${error_count} -gt 0 ]]; then
    return 1  # Errors found
  else
    return 0  # No errors
  fi
}

# Calculate timestamp range for log query
# Usage: calculate_log_query_timestamps WAIT_TIME_SECONDS
# Sets global variables: LOG_QUERY_START_MS, LOG_QUERY_END_MS
calculate_log_query_timestamps() {
  local wait_time_seconds="$1"
  
  if [[ -z "${wait_time_seconds}" ]]; then
    echo "Error: calculate_log_query_timestamps requires wait time in seconds" >&2
    return 1
  fi
  
  # Get current time in milliseconds
  local current_time_s
  current_time_s=$(date +%s)
  local current_time_ms=$((current_time_s * 1000))
  
  # Calculate start time (wait_time seconds ago)
  local start_time_ms=$(( current_time_ms - (wait_time_seconds * 1000) ))
  
  # Add 5 second buffer to end time for clock skew and Lambda delays
  local end_time_ms=$(( current_time_ms + 5000 ))
  
  # Set global variables for use by check_logs (bash doesn't export from functions reliably)
  LOG_QUERY_START_MS="${start_time_ms}"
  LOG_QUERY_END_MS="${end_time_ms}"
}

# Display log check results
# Usage: display_log_check_results
display_log_check_results() {
  if [[ -z "${LAST_LOG_OUTPUT}" ]]; then
    echo "No log check results to display" >&2
    return 1
  fi
  
  local error_count="${LAST_ERROR_COUNT:-0}"
  
  # Calculate time range in human-readable format
  local start_time_s=$((LOG_QUERY_START_MS / 1000))
  local end_time_s=$((LOG_QUERY_END_MS / 1000))
  local start_time_str=$(date -r "${start_time_s}" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "N/A")
  local end_time_str=$(date -r "${end_time_s}" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "N/A")
  local duration_s=$(( (end_time_s - start_time_s) ))
  
  if [[ ${error_count} -eq 0 ]]; then
    echo "  ✅ No errors found in CloudWatch logs"
    echo "  📊 Time range: ${start_time_str} - ${end_time_str} (${duration_s} seconds)"
    return 0
  fi
  
  # Display errors with enhanced formatting
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  ⚠️  ERRORS DETECTED IN CLOUDWATCH LOGS                    ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Time Range: ${start_time_str} - ${end_time_str} (${duration_s} seconds)"
  echo "Log Group: ${LOG_GROUP}"
  echo "Errors Found: ${error_count}"
  echo ""
  
  # Parse and display each error with full context
  local event_index=0
  echo "${LAST_LOG_OUTPUT}" | jq -c '.events[]' 2>/dev/null | while IFS= read -r event; do
    ((event_index++))
    
    # Extract event details
    local timestamp=$(echo "${event}" | jq -r '.timestamp')
    local log_stream=$(echo "${event}" | jq -r '.logStreamName')
    local message=$(echo "${event}" | jq -r '.message')
    
    # Format timestamp
    local timestamp_s=$((timestamp / 1000))
    local time_str=$(date -r "${timestamp_s}" "+%H:%M:%S" 2>/dev/null || echo "N/A")
    
    # Display error with context
    echo "[${time_str}] ERROR"
    
    # Extract log stream name (show only the date/version part for readability)
    local stream_short=$(echo "${log_stream}" | sed 's|.*/\[\$LATEST\]|\[\$LATEST\]|')
    echo "  Log Stream: ${stream_short}"
    echo ""
    
    # Display the error message with proper indentation
    # Handle multi-line messages (like stack traces)
    echo "${message}" | while IFS= read -r line; do
      # Check if line contains ERROR keyword or looks like a stack trace
      if [[ "${line}" == *"ERROR"* ]] || [[ "${line}" == *"Error:"* ]]; then
        echo "  └─ ${line}"
      elif [[ "${line}" =~ ^[[:space:]]*at[[:space:]] ]] || [[ "${line}" =~ ^[[:space:]]+[a-zA-Z] ]]; then
        # Stack trace line
        echo "     ${line}"
      else
        # Regular message line
        echo "  ${line}"
      fi
    done
    
    echo ""
  done
  
  echo "────────────────────────────────────────────────────────────"
  echo ""
}
