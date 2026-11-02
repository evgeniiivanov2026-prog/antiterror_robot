#!/bin/sh
set -eu

cd "$(dirname "$0")"

# An SSH disconnect kills a foreground build. Run detached and keep a log.
if [ -z "${UP_DETACHED:-}" ]; then
  if [ -f up.pid ] && kill -0 "$(cat up.pid)" 2>/dev/null; then
    echo "Сборка уже идёт. Журнал: tail -f up.log"
    exit 0
  fi
  export UP_DETACHED=1
  nohup "$0" >up.log 2>&1 &
  echo $! >up.pid
  echo "Сборка идёт в фоне и не оборвётся вместе со связью SSH."
  echo "Журнал: tail -f up.log"
  tail -f --pid "$(cat up.pid)" up.log || true
  rm -f up.pid
  exit 0
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан файл .env. Впишите токен в MAX_BOT_TOKEN и запустите скрипт снова."
  exit 1
fi

export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
export COMPOSE_BAKE=false

if docker image inspect node:22-bookworm-slim >/dev/null 2>&1; then
  echo "Образ Node.js уже есть на сервере, заново не скачиваю."
else
  echo "Скачиваю образ Node.js..."
  attempt=1
  while [ "$attempt" -le 4 ]; do
    if docker pull node:22-bookworm-slim; then
      break
    fi
    if [ "$attempt" -eq 4 ]; then
      echo "Не удалось скачать образ node:22-bookworm-slim. Проверьте интернет сервера и запустите bash up.sh ещё раз."
      exit 1
    fi
    echo "Скачивание прервалось. Повтор через несколько секунд..."
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
  done
fi

echo "Собираю образ. Библиотеки уже в проекте, сайт npm не используется."
docker build -t max-moderator-bot .
docker compose up -d
docker compose logs --tail=40 bot
