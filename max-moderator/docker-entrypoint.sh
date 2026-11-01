#!/bin/sh
set -eu

node node_modules/prisma/build/index.js migrate deploy
exec node dist/bot/index.js
