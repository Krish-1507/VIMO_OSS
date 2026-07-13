#!/bin/bash
# Check Node.js is installed
if ! command -v node &> /dev/null; then
  xdg-open "https://nodejs.org/en/download" || echo "Please visit https://nodejs.org/en/download to install Node.js"
  echo "Node.js is required. Your browser has opened the download page."
  echo "Install Node.js and then run this script again."
  read -p "Press Enter to close..."
  exit 1
fi
# Navigate to script directory
cd "$(dirname "$0")"
echo "Starting VIMO... this takes about 10 seconds on the first run."
npm install --silent
npm run dev &
sleep 4
xdg-open http://localhost:5173 || echo "Please open http://localhost:5173 in your browser"
wait
