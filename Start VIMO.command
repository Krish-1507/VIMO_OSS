#!/bin/bash
# Check Node.js is installed
if ! command -v node &> /dev/null; then
  open "https://nodejs.org/en/download"
  echo "Node.js is required. Your browser has opened the download page."
  echo "Install the LTS version of Node.js, then double-click this file again."
  read -p "Press Enter to close..."
  exit 1
fi
# Navigate to script directory and use the same launcher as the `vimo` command
cd "$(dirname "$0")"
node "packages/cli/bin/vimo.mjs" "$@"
