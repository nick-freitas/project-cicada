#!/bin/bash

# Batch upload Higurashi script files to S3 with rate limiting
# Usage: ./scripts/batch-upload-scripts.sh [batch_size] [delay_seconds]
#
# Examples:
#   ./scripts/batch-upload-scripts.sh 10 30    # Upload 10 files, wait 30s between batches
#   ./scripts/batch-upload-scripts.sh 50 60    # Upload 50 files, wait 60s between batches
#   ./scripts/batch-upload-scripts.sh all 0    # Upload all files at once (no delay)

set -e

BUCKET="projectcicadadatastack-scriptdataf7e49bc5-uqjsdje7v81e"
PROFILE="cicada-deployer"
SCRIPT_DIR="hig_script"

BATCH_SIZE=${1:-10}
DELAY=${2:-30}

echo "=== Batch Upload Configuration ==="
echo "Bucket: $BUCKET"
echo "Batch size: $BATCH_SIZE"
echo "Delay between batches: ${DELAY}s"
echo ""

# Get list of files to upload
FILES=(${SCRIPT_DIR}/*.json)
TOTAL_FILES=${#FILES[@]}

echo "Found $TOTAL_FILES files to upload"
echo ""

UPLOADED=0
BATCH_NUM=1

if [ "$BATCH_SIZE" = "all" ]; then
  echo "Uploading all files at once..."
  for file in "${FILES[@]}"; do
    filename=$(basename "$file")
    echo "📤 [$((UPLOADED+1))/$TOTAL_FILES] Uploading $filename..."
    aws s3 cp "$file" "s3://${BUCKET}/${filename}" --profile ${PROFILE} --quiet
    ((UPLOADED++))
  done
else
  for ((i=0; i<TOTAL_FILES; i++)); do
    file="${FILES[$i]}"
    filename=$(basename "$file")
    
    echo "📤 [$((i+1))/$TOTAL_FILES] Uploading $filename..."
    aws s3 cp "$file" "s3://${BUCKET}/${filename}" --profile ${PROFILE} --quiet
    ((UPLOADED++))
    
    # Check if we've completed a batch
    if [ $((UPLOADED % BATCH_SIZE)) -eq 0 ] && [ $UPLOADED -lt $TOTAL_FILES ]; then
      echo ""
      echo "✅ Batch $BATCH_NUM complete ($UPLOADED/$TOTAL_FILES files uploaded)"
      echo "⏳ Waiting ${DELAY}s before next batch..."
      echo ""
      sleep $DELAY
      ((BATCH_NUM++))
    fi
  done
fi

echo ""
echo "=== Upload Complete ==="
echo "Total files uploaded: $UPLOADED"
echo ""
echo "💡 Tip: Monitor Lambda processing with:"
echo "   aws logs tail /aws/lambda/ProjectCICADADataStack-ScriptIngestionHandlerF528C-NaO0itffEx1k --follow --profile cicada-deployer"
