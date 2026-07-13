#!/bin/bash
# Check Node.js is installed
if ! command -v node &> /dev/null; then
  open "https://nodejs.org/en/download"
  echo "Node.js is required. Your browser has opened the download page."
  echo "Install Node.js and then double-click this file again."
  read -p "Press Enter to close..."
  exit 1
fi
# Navigate to script directory
cd "$(dirname "$0")"
echo "Starting VIMO... this takes about 10 seconds on the first run."
npm install --silent
npm run dev &
sleep 4
open http://localhost:5173
wait
