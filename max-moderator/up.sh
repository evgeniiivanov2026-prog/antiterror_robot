#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан файл .env. Впишите токен в MAX_BOT_TOKEN и запустите скрипт снова."
  exit 1
fi

export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
export COMPOSE_BAKE=false

echo "Скачиваю образ Node.js..."
docker pull node:22-bookworm-slim

echo "Собираю бота старым сборщиком Docker..."
docker compose build --no-cache
docker compose up -d
docker compose logs --tail=40 bot
