#!/bin/sh
set -eu

echo "max-moderator: запускаю программу" >&2
export CHECKPOINT_DISABLE=1
export PRISMA_HIDE_UPDATE_MESSAGE=1

if [ -s /app/certs/russian-trusted-ca.pem ]; then
  export NODE_EXTRA_CA_CERTS=/app/certs/russian-trusted-ca.pem
fi
if [ -z "${NODE_EXTRA_CA_CERTS:-}" ] || [ ! -s "$NODE_EXTRA_CA_CERTS" ]; then
  echo "max-moderator: нет российского сертификата для max.ru" >&2
  exit 1
fi

schema_engine=$(find node_modules -name 'schema-engine-debian-openssl-3.0.x' -type f | head -n 1)
query_engine=$(find node_modules -name 'libquery_engine-debian-openssl-3.0.x.so.node' -type f | head -n 1)
if [ -z "$schema_engine" ] || [ -z "$query_engine" ]; then
  echo "max-moderator: в образе нет локальных файлов базы, скачивание из интернета отключено" >&2
  exit 1
fi
export PRISMA_SCHEMA_ENGINE_BINARY="$schema_engine"
export PRISMA_QUERY_ENGINE_LIBRARY="$query_engine"

echo "max-moderator: применяю миграции базы" >&2
attempt=1
while [ "$attempt" -le 12 ]; do
  if node node_modules/prisma/build/index.js migrate deploy; then
    break
  fi
  echo "max-moderator: база не ответила, попытка $attempt из 12" >&2
  attempt=$((attempt + 1))
  sleep 5
done
if [ "$attempt" -gt 12 ]; then
  echo "max-moderator: миграция базы не выполнена" >&2
  exit 1
fi

echo "max-moderator: база готова, подключаюсь к MAX" >&2
exec node dist/bot/index.js
