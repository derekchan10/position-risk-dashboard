#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p _worker-site
cp index.html app.js planner.js planner-ui.js _worker-site/
cp -R data _worker-site/
