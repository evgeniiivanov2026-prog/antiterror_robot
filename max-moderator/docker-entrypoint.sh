#!/bin/sh
set -eu

pnpm exec prisma migrate deploy
exec node dist/bot/index.js
