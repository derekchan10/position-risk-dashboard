#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p _pages-site
cp index.html app.js planner.js planner-ui.js robots.txt _headers _pages-site/
cp worker/index.mjs _pages-site/_worker.js
cat > _pages-site/_routes.json <<'ROUTES'
{"version":1,"include":["/auth/*","/api/*"],"exclude":[]}
ROUTES
