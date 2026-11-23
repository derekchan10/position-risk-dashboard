#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p _worker-site
rm -rf _worker-site/data
cp index.html app.js planner.js planner-ui.js _worker-site/
