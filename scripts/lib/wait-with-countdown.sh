#!/bin/bash

# Wait with countdown progress indicator
# Displays a countdown timer while waiting for a specified duration

# wait_with_countdown - Wait for specified seconds with countdown display
# Usage: wait_with_countdown <seconds>
# Arguments:
#   seconds - Number of seconds to wait (must be positive integer)
# Returns:
#   0 on success
#   1 if invalid argument
wait_with_countdown() {
  local wait_seconds="$1"
  
  # Validate argument
  if [[ -z "${wait_seconds}" ]] || [[ ! "${wait_seconds}" =~ ^[0-9]+$ ]]; then
    echo "Error: wait_with_countdown requires a positive integer argument" >&2
    return 1
  fi
  
  if [[ "${wait_seconds}" -le 0 ]]; then
    echo "Error: wait time must be greater than 0" >&2
    return 1
  fi
  
  # Display countdown header
  echo "⏳ Waiting ${wait_seconds} seconds: "
  
  # Countdown loop
  for ((i=wait_seconds; i>0; i--)); do
    # Display countdown with carriage return to overwrite
    printf "\r⏳ Waiting ${wait_seconds} seconds: %d..." "${i}"
    sleep 1
  done
  
  # Clear the countdown line and show completion
  printf "\r⏳ Waiting ${wait_seconds} seconds: Done!     \n"
  
  return 0
}
