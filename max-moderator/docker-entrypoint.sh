#!/bin/sh
set -eu

echo "max-moderator: запускаю программу" >&2
echo "max-moderator: применяю миграции базы" >&2
node node_modules/prisma/build/index.js migrate deploy
echo "max-moderator: база готова, подключаюсь к MAX" >&2
exec node dist/bot/index.js
