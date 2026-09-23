#!/bin/bash
# MOST Финансы — сервер + доступ из интернета через Cloudflare Tunnel (macOS / Linux)
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Не найден Node.js: https://nodejs.org (LTS)"; read -p "Enter…"; exit 1; }
command -v cloudflared >/dev/null 2>&1 || { echo "Не найден cloudflared: brew install cloudflared (macOS) или см. README"; read -p "Enter…"; exit 1; }
node tools/serve-internet.js
