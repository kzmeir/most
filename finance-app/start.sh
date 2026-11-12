#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Нужен Node.js: https://nodejs.org (LTS)"; exit 1; }
node server.js
