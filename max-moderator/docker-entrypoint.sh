#!/bin/sh
set -eu

attempts=0
until pnpm exec prisma migrate deploy --schema src/database/schema.prisma
do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 20 ]; then
    echo "database migration failed" >&2
    exit 1
  fi
  sleep 2
done

exec node dist/main.js
