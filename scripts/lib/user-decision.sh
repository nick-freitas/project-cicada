#!/bin/bash

# User decision prompting library
# Provides functions for prompting users to make decisions when errors are detected

# Prompt user for decision when errors are detected
# Returns:
#   0 - Continue with next batch
#   1 - Abort upload process
#   2 - Retry log check
prompt_user_decision() {
  echo ""
  echo "────────────────────────────────────────────────────────────"
  echo ""
  echo "What would you like to do?"
  echo "  [c] Continue with next batch"
  echo "  [a] Abort upload process"
  echo "  [r] Retry log check"
  echo ""
  
  while true; do
    read -p "Choice: " -n 1 -r choice
    echo ""
    
    case "${choice}" in
      c|C)
        echo "  ▶️  Continuing with next batch..."
        return 0
        ;;
      a|A)
        echo "  🛑 Aborting upload process..."
        return 1
        ;;
      r|R)
        echo "  🔄 Retrying log check..."
        return 2
        ;;
      *)
        echo "  ❌ Invalid choice. Please enter 'c', 'a', or 'r'."
        echo ""
        ;;
    esac
  done
}
