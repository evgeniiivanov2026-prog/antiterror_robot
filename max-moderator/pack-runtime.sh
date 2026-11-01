#!/bin/sh
# Builds vendor/runtime.tar.gz so the server image does not download from npm.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$root"
pnpm exec tsc -p tsconfig.json

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/src/database"
cp package.json pnpm-lock.yaml "$stage/"
cp src/database/schema.prisma "$stage/src/database/"

cd "$stage"
pnpm install --prod --frozen-lockfile
pnpm add prisma@6.19.0 --save-prod
pnpm exec prisma generate --schema src/database/schema.prisma
rm -rf src dist
cp -a "$root/src/database" src/database
cp -a "$root/dist" dist
pnpm prune --prod

mkdir -p "$root/vendor"
tar -czf "$root/vendor/runtime.tar.gz" package.json dist src node_modules
echo "Собран $root/vendor/runtime.tar.gz"
