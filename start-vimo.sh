#!/bin/bash
# Check Node.js is installed
if ! command -v node &> /dev/null; then
  xdg-open "https://nodejs.org/en/download" || echo "Please visit https://nodejs.org/en/download to install Node.js"
  echo "Node.js is required. Your browser has opened (or: please visit) the download page."
  echo "Install the LTS version of Node.js, then run this script again."
  exit 1
fi
# Navigate to script directory and use the same launcher as the `vimo` command
cd "$(dirname "$0")"
node "packages/cli/bin/vimo.mjs" "$@"
