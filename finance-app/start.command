#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите один раз с https://nodejs.org (LTS), затем запустите снова."
  read -p "Enter для выхода"
  exit 1
fi
echo "Запуск MOST Финансы..."
(sleep 1; open http://localhost:3000) &
node server.js
