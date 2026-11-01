#!/bin/sh
set -eu
pnpm prisma migrate deploy
exec node dist/index.js
