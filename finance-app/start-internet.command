#!/bin/bash
# MOST Финансы — доступ из интернета через Cloudflare Tunnel (macOS / Linux)
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Не найден Node.js: https://nodejs.org (LTS)"; read -p "Enter…"; exit 1; }
command -v cloudflared >/dev/null 2>&1 || { echo "Не найден cloudflared. Установите: brew install cloudflared (macOS) или см. README"; read -p "Enter…"; exit 1; }
export TRUST_PROXY=1
node server.js &
SRV=$!
sleep 2
echo
echo "Ниже появится адрес вида https://....trycloudflare.com — отправьте его сотрудникам вместе с логином и паролем."
echo
if [ -f tunnel.txt ]; then cloudflared tunnel run "$(cat tunnel.txt)"; else cloudflared tunnel --url http://localhost:3000; fi
kill $SRV 2>/dev/null
