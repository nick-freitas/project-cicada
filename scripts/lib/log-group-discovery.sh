#!/bin/bash

# CloudWatch log group discovery functions
# This file contains reusable functions for discovering and caching CloudWatch log groups

# Global variable for log group name (cached across batches)
LOG_GROUP=""

# Discover CloudWatch log group for ScriptIngestionHandler
# Returns: 0 on success, 1 on failure
# Side effects: Sets LOG_GROUP variable, may disable MONITORING_ENABLED
discover_log_group() {
  # Only discover if monitoring is enabled
  if [[ "${MONITORING_ENABLED}" != "true" ]]; then
    return 0
  fi
  
  echo "🔍 Discovering CloudWatch log group for ScriptIngestionHandler..."
  
  # Query AWS for log groups matching ScriptIngestionHandler
  local log_groups_output
  log_groups_output=$(aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/" \
    --profile "${PROFILE}" \
    --output json 2>&1)
  
  local aws_exit_code=$?
  
  # Check for AWS CLI errors
  if [[ ${aws_exit_code} -ne 0 ]]; then
    echo "⚠️  Warning: Failed to query CloudWatch log groups" >&2
    echo "   Error: ${log_groups_output}" >&2
    echo "   Monitoring will be disabled for this run" >&2
    MONITORING_ENABLED=false
    return 1
  fi
  
  # Parse JSON response to find log group containing "ScriptIngestionHandler"
  LOG_GROUP=$(echo "${log_groups_output}" | \
    jq -r '.logGroups[] | select(.logGroupName | contains("ScriptIngestionHandler")) | .logGroupName' | \
    head -n 1)
  
  # Handle case where log group is not found
  if [[ -z "${LOG_GROUP}" ]]; then
    echo "⚠️  Warning: Could not find ScriptIngestionHandler log group" >&2
    echo "   Monitoring will be disabled for this run" >&2
    MONITORING_ENABLED=false
    return 1
  fi
  
  # Display discovered log group for transparency
  echo "✅ Found log group: ${LOG_GROUP}"
  echo ""
  
  return 0
}
