#!/bin/bash

# Script to upload only unprocessed Higurashi script files to S3 with CloudWatch monitoring
# Usage: ./scripts/upload-unprocessed-scripts.sh [OPTIONS]
#
# Options:
#   --batch-size N        Number of files to upload per batch (default: 10)
#   --wait-time N         Seconds to wait between batches (default: 30)
#   --no-monitoring       Disable log monitoring (original behavior)
#   --profile PROFILE     AWS CLI profile to use (default: cicada-deployer)
#   --help                Display usage information

set -e

# Get the directory where this script is located
SCRIPT_DIR_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the log group discovery library
source "${SCRIPT_DIR_PATH}/lib/log-group-discovery.sh"

# Source the wait with countdown library
source "${SCRIPT_DIR_PATH}/lib/wait-with-countdown.sh"

# Source the CloudWatch logs library
source "${SCRIPT_DIR_PATH}/lib/cloudwatch-logs.sh"

# Source the user decision library
source "${SCRIPT_DIR_PATH}/lib/user-decision.sh"

# Source the error handling library
source "${SCRIPT_DIR_PATH}/lib/error-handling.sh"

# Default configuration
BUCKET="projectcicadadatastack-scriptdataf7e49bc5-uqjsdje7v81e"
PROFILE="cicada-deployer"
SCRIPT_DIR="hig_script"
BATCH_SIZE=10
WAIT_TIME=30
MONITORING_ENABLED=true

# Display usage information
show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Upload Higurashi script files to S3 with optional CloudWatch monitoring.

Options:
  --batch-size N        Number of files to upload per batch (default: 10)
                        Must be a positive integer
  
  --wait-time N         Seconds to wait between batches (default: 30)
                        Must be a positive integer
  
  --no-monitoring       Disable CloudWatch log monitoring
                        Restores original fast upload behavior
  
  --profile PROFILE     AWS CLI profile to use (default: cicada-deployer)
  
  --help                Display this help message and exit

Examples:
  # Default behavior with monitoring
  $(basename "$0")
  
  # Custom batch size and wait time
  $(basename "$0") --batch-size 5 --wait-time 60
  
  # Disable monitoring for fast upload
  $(basename "$0") --no-monitoring
  
  # Use different AWS profile
  $(basename "$0") --profile my-profile

Environment:
  AWS_PROFILE           Can be set instead of using --profile flag
  
Requirements:
  - AWS CLI must be installed and configured
  - Valid AWS credentials for the specified profile
  - Permissions: s3:ListBucket, s3:PutObject, logs:DescribeLogGroups, logs:FilterLogEvents

EOF
}

# Parse command-line arguments
parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --batch-size)
        if [[ -z "$2" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
          echo "Error: --batch-size requires a positive integer argument" >&2
          exit 1
        fi
        BATCH_SIZE="$2"
        if [[ "${BATCH_SIZE}" -le 0 ]]; then
          echo "Error: --batch-size must be greater than 0" >&2
          exit 1
        fi
        shift 2
        ;;
      --wait-time)
        if [[ -z "$2" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
          echo "Error: --wait-time requires a positive integer argument" >&2
          exit 1
        fi
        WAIT_TIME="$2"
        if [[ "${WAIT_TIME}" -le 0 ]]; then
          echo "Error: --wait-time must be greater than 0" >&2
          exit 1
        fi
        shift 2
        ;;
      --no-monitoring)
        MONITORING_ENABLED=false
        shift
        ;;
      --profile)
        if [[ -z "$2" ]]; then
          echo "Error: --profile requires an argument" >&2
          exit 1
        fi
        PROFILE="$2"
        shift 2
        ;;
      --help)
        show_help
        exit 0
        ;;
      *)
        echo "Error: Unknown option: $1" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
    esac
  done
}

# Parse arguments
parse_arguments "$@"

# Check AWS credentials before proceeding
echo "🔐 Verifying AWS credentials..."
if ! check_aws_credentials "${PROFILE}"; then
  exit ${EXIT_AUTH_ERROR}
fi
echo "✅ AWS credentials verified"
echo ""

# Display configuration
echo "=== Upload Configuration ==="
echo "Batch size: ${BATCH_SIZE} files"
echo "Wait time: ${WAIT_TIME} seconds"
echo "Monitoring: ${MONITORING_ENABLED}"
echo "Profile: ${PROFILE}"
echo "Bucket: ${BUCKET}"
echo ""

# Discover log group if monitoring is enabled
if [[ "${MONITORING_ENABLED}" == "true" ]]; then
  discover_log_group
fi

echo "Fetching list of already processed files..."
PROCESSED_FILES=$(aws s3 ls s3://${BUCKET}/processed/ --recursive --profile ${PROFILE} | awk '{print $4}' | sed 's|processed/.*/||' | sort | uniq)

echo "Found $(echo "$PROCESSED_FILES" | wc -l) processed files"
echo ""

# Build array of unprocessed files
UNPROCESSED_FILES=()
for file in ${SCRIPT_DIR}/*.json; do
  filename=$(basename "$file")
  
  # Check if this file has already been processed
  if echo "$PROCESSED_FILES" | grep -q "^${filename}$"; then
    echo "⏭️  Skipping $filename (already processed)"
  else
    UNPROCESSED_FILES+=("$file")
  fi
done

TOTAL_FILES=${#UNPROCESSED_FILES[@]}
SKIPPED=$(($(ls -1 ${SCRIPT_DIR}/*.json 2>/dev/null | wc -l) - TOTAL_FILES))

if [[ ${TOTAL_FILES} -eq 0 ]]; then
  echo ""
  echo "=== Summary ==="
  echo "No files to upload - all files already processed"
  echo "Uploaded: 0 files"
  echo "Skipped: ${SKIPPED} files"
  echo "Total: ${SKIPPED} files"
  exit 0
fi

echo ""
echo "Found ${TOTAL_FILES} files to upload"
echo ""

# Calculate number of batches
TOTAL_BATCHES=$(( (TOTAL_FILES + BATCH_SIZE - 1) / BATCH_SIZE ))

# Counters
UPLOADED=0
CURRENT_BATCH=0

# Process files in batches
for ((i=0; i<TOTAL_FILES; i+=BATCH_SIZE)); do
  ((CURRENT_BATCH++))
  
  # Calculate batch boundaries
  BATCH_START=$i
  BATCH_END=$((i + BATCH_SIZE))
  if [[ ${BATCH_END} -gt ${TOTAL_FILES} ]]; then
    BATCH_END=${TOTAL_FILES}
  fi
  
  BATCH_FILE_COUNT=$((BATCH_END - BATCH_START))
  
  # Display batch progress
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  📦 Batch ${CURRENT_BATCH}/${TOTAL_BATCHES}: Uploading ${BATCH_FILE_COUNT} files...                    ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  
  # Upload files in current batch
  for ((j=BATCH_START; j<BATCH_END; j++)); do
    file="${UNPROCESSED_FILES[$j]}"
    filename=$(basename "$file")
    
    echo "  📤 Uploading $filename..."
    # Use safe_s3_upload which handles errors and exits on failure
    safe_s3_upload "$file" "s3://${BUCKET}/${filename}" "${PROFILE}"
    ((UPLOADED++))
    
    # Small delay to avoid overwhelming the Lambda
    sleep 0.5
  done
  
  echo ""
  echo "  ✅ Batch ${CURRENT_BATCH}/${TOTAL_BATCHES} complete (${UPLOADED}/${TOTAL_FILES} files uploaded)"
  echo ""
  
  # Wait and check logs between batches (except after the last batch)
  if [[ ${CURRENT_BATCH} -lt ${TOTAL_BATCHES} ]] && [[ "${MONITORING_ENABLED}" == "true" ]]; then
    wait_with_countdown "${WAIT_TIME}"
    echo ""
    
    # Calculate timestamp range for log query
    calculate_log_query_timestamps "${WAIT_TIME}"
    
    # Check CloudWatch logs for errors
    while true; do
      echo "  🔍 Checking CloudWatch logs for errors..."
      if check_logs "${LOG_QUERY_START_MS}" "${LOG_QUERY_END_MS}"; then
        # No errors found
        display_log_check_results
        break
      else
        local check_result=$?
        if [[ ${check_result} -eq 1 ]]; then
          # Errors found - display them and prompt user
          display_log_check_results
          
          # Prompt user for decision
          prompt_user_decision
          local decision=$?
          
          if [[ ${decision} -eq 0 ]]; then
            # Continue with next batch
            break
          elif [[ ${decision} -eq 1 ]]; then
            # Abort upload process
            echo ""
            echo "=== Upload Aborted ==="
            echo "Uploaded: ${UPLOADED} files"
            echo "Skipped: ${SKIPPED} files"
            echo "Total batches completed: ${CURRENT_BATCH}/${TOTAL_BATCHES}"
            echo "Total: $((UPLOADED + SKIPPED)) files"
            exit 0
          elif [[ ${decision} -eq 2 ]]; then
            # Retry log check
            echo ""
            continue
          fi
        elif [[ ${check_result} -eq 2 ]]; then
          # AWS CLI error - use comprehensive error handler
          handle_cloudwatch_error "${LAST_LOG_OUTPUT}"
          local decision=$?
          
          if [[ ${decision} -eq 0 ]]; then
            # Continue without monitoring
            echo "  ⚠️  Monitoring disabled for remaining batches"
            MONITORING_ENABLED=false
            break
          elif [[ ${decision} -eq 1 ]]; then
            # Abort upload process
            echo ""
            echo "=== Upload Aborted ==="
            echo "Uploaded: ${UPLOADED} files"
            echo "Skipped: ${SKIPPED} files"
            echo "Total batches completed: ${CURRENT_BATCH}/${TOTAL_BATCHES}"
            echo "Total: $((UPLOADED + SKIPPED)) files"
            exit ${EXIT_USER_ABORT}
          elif [[ ${decision} -eq 2 ]]; then
            # Retry log check
            echo ""
            continue
          fi
        fi
      fi
    done
    echo ""
  fi
done

echo ""
echo "=== Summary ==="
echo "Uploaded: ${UPLOADED} files"
echo "Skipped: ${SKIPPED} files"
echo "Total batches: ${TOTAL_BATCHES}"
echo "Total: $((UPLOADED + SKIPPED)) files"
