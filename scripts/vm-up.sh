#!/bin/sh
# One virtual machine runs the database, the site, the bot, and a temporary HTTPS address.
set -eu

cd "$(dirname "$0")/.."

if [ "${1:-}" = "--install-boot" ]; then
  unit=/etc/systemd/system/antiterror-vm.service
  sudo tee "$unit" >/dev/null <<EOF
[Unit]
Description=AntiTerror Robot virtual machine
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=${USER}
Group=docker
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/scripts/vm-up.sh
ExecStop=$(pwd)/scripts/vm-down.sh
TimeoutStartSec=900

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable antiterror-vm.service
  echo "Автозапуск записан. Машина поднимет сервис после включения."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "Нужны Docker и Python. Сначала: sudo apt install -y docker.io docker-compose-v2 docker-buildx python3" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    systemctl enable --now docker
  fi
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker не запустился. Выполните от root: systemctl enable --now docker" >&2
  systemctl status docker --no-pager >&2 || true
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Нет команды docker compose. Выполните: apt install -y docker-compose-v2" >&2
  exit 1
fi
if ! docker buildx version >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update
    apt-get install -y docker-buildx
  fi
fi
if ! docker buildx version >/dev/null 2>&1; then
  echo "Нет плагина buildx. Выполните: apt install -y docker-buildx" >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "Создайте .env из .env.example и впишите BOT_TOKEN и CONTACT_ENCRYPTION_KEY." >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import sys

env = {}
for line in Path(".env").read_text(encoding="utf-8").splitlines():
    raw = line.strip()
    if not raw or raw.startswith("#") or "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    env[key.strip()] = value.strip().strip('"').strip("'")

bypass = env.get("ALLOW_DEV_AUTH_BYPASS", "false").lower()
if bypass in {"1", "true", "yes"}:
    sys.exit("ALLOW_DEV_AUTH_BYPASS должен быть false: адрес машины будет виден из интернета.")
if not env.get("CONTACT_ENCRYPTION_KEY"):
    sys.exit("Впишите CONTACT_ENCRYPTION_KEY в .env.")
mode = env.get("BOT_MODE", "polling")
if mode not in {"polling", "webhook", "disabled"}:
    sys.exit("BOT_MODE должен быть polling, webhook или disabled.")
if mode != "disabled" and not env.get("BOT_TOKEN"):
    sys.exit("Впишите BOT_TOKEN из BotFather.")
if mode == "webhook" and not env.get("BOT_WEBHOOK_SECRET"):
    sys.exit("Для вебхука впишите BOT_WEBHOOK_SECRET.")
PY

docker compose --profile vm up --build -d

url=""
i=0
while [ "$i" -lt 40 ]; do
  url=$(docker compose --profile vm logs tunnel 2>/dev/null | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -n 1 || true)
  if [ -n "$url" ]; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ -z "$url" ]; then
  echo "Туннель не выдал адрес. Посмотрите журнал: docker compose --profile vm logs tunnel" >&2
  exit 1
fi

python3 - "$url" <<'PY'
import sys
from pathlib import Path

url = sys.argv[1]
path = Path(".env")
lines = path.read_text(encoding="utf-8").splitlines()
found = False
out = []
for line in lines:
    if line.startswith("WEBAPP_URL="):
        out.append(f"WEBAPP_URL={url}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"WEBAPP_URL={url}")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
PY

docker compose --profile vm up -d --force-recreate --no-deps backend

ready=0
i=0
while [ "$i" -lt 40 ]; do
  if python3 - <<'PY'
import sys
import urllib.request
try:
    with urllib.request.urlopen("http://127.0.0.1:8088/api/v1/health", timeout=3) as response:
        sys.exit(0 if response.status == 200 else 1)
except Exception:
    sys.exit(1)
PY
  then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Сайт на машине не ответил. Журнал: docker compose --profile vm logs backend" >&2
  exit 1
fi

python3 - "$url" <<'PY'
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

public = sys.argv[1]
env = {}
for line in Path(".env").read_text(encoding="utf-8").splitlines():
    raw = line.strip()
    if not raw or raw.startswith("#") or "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    env[key.strip()] = value.strip().strip('"').strip("'")

token = env.get("BOT_TOKEN", "")
mode = env.get("BOT_MODE", "polling")
if mode == "disabled" or not token:
    sys.exit(0)

def call(method, fields):
    body = urllib.parse.urlencode(fields).encode()
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=body,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

try:
    if mode == "webhook":
        result = call(
            "setWebhook",
            {
                "url": f"{public}/api/v1/telegram/webhook",
                "secret_token": env.get("BOT_WEBHOOK_SECRET", ""),
                "drop_pending_updates": "true",
            },
        )
    else:
        result = call("deleteWebhook", {"drop_pending_updates": "false"})
except Exception:
    sys.exit("Telegram не ответил. Проверьте токен и что машина выходит в интернет.")
if not result.get("ok"):
    sys.exit("Telegram не принял настройку бота.")
PY

echo "Машина работает. Откройте бота в Telegram и нажмите «Сообщить»."
echo "Адрес страницы: $url"
