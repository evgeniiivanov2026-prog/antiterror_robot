# AntiTerror Robot

Спокойный сервис фиксации: человек описывает мошенничество, вербовку, шантаж или попытку втянуть кого-то в противоправные действия, сохраняет карточку и получает понятный следующий шаг.

Слоган: «Сообщай. Фиксируй. Защищай.»

Это не правоохранительный орган. Бот не проводит проверку, никого не обвиняет и не отправляет заявление в МВД. При непосредственной угрозе на экране и в боте указаны **112** и **102**.

Имя бота в Telegram задаётся в BotFather: `@antiterror_robot`, отображаемое имя AntiTerror Robot. Код этого имени не назначает.

## Что есть в MVP

- FastAPI: карточка, файлы, PDF, срочная помощь, удаление, роли `user` / `moderator` / `admin`.
- PostgreSQL-модель `IncidentReport` и миграция Alembic.
- Mini App: главный экран, категории, пошаговая форма, срочная помощь, доказательства, контакты, результат.
- Бот с командами `/start`, `/report`, `/emergency`, `/evidence`, `/privacy`.
- Docker Compose для локального запуска.
- Тесты pytest и Vitest.

## Локально без Docker

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pytest
```

```bash
cd frontend
npm install
npm test
npm run dev
```

API для Vite-прокси: `uvicorn app.main:app --reload` из каталога `backend`. База по умолчанию — локальный SQLite `backend/dev.db`. Для карточек из браузера без Telegram задайте `ALLOW_DEV_AUTH=true` и `VITE_DEV_USER_ID=1001`. В production такой флаг запрещён.

## Локально в Docker

```bash
cp .env.example .env
# Впишите BOT_TOKEN, CONTACT_ENCRYPTION_KEY и LOG_HASH_SALT.
# Ключ: python -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose up --build
```

Приложение откроется на `http://localhost:8080`. Это учебный HTTP. Telegram Mini App на телефоне требует публичный HTTPS.

Если `BOT_TOKEN` пустой, процесс бота пишет об этом и завершается без перезапуска. API при этом поднимается.

Проверка после старта:

```bash
curl -s http://localhost:8080/api/v1/health
```

Ожидается `{"status":"ok"}`.

## Промышленный контур

1. Выпустите сертификат. Самоподписанный сертификат из `sh deploy/generate-dev-cert.sh` годится только чтобы проверить nginx, телефон Telegram его не примет.
2. Заполните боевые значения: `BOT_TOKEN`, `CONTACT_ENCRYPTION_KEY`, `LOG_HASH_SALT`, `WEBHOOK_SECRET`, `PUBLIC_API_URL`, `WEBAPP_URL`, пароль Postgres и ключи S3.
3. Запуск: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build`.
4. В BotFather укажите URL Mini App и команды бота. При `BOT_MODE=webhook` отдельный процесс polling не нужен: его отключает профиль в prod-файле.
5. Поставьте в cron `python -m app.workers.retention`.

`ENFORCE_HTTPS=true` отклоняет запросы без `https`, кроме внутренней проверки `/api/v1/health`.

## Как устроены данные

Карточка получает короткий номер вида `ATR-7K2MQ9`. Контакт автора шифруется. Модератор видит описание, но не контакт. Статус `forwarded` означает только то, что человеку подсказали обратиться в МВД.

Подробности: [docs/API.md](docs/API.md), [docs/PRIVACY.md](docs/PRIVACY.md), [docs/SECURITY.md](docs/SECURITY.md).

## Проверка тестами

```bash
make test
```

Нужны Python 3.12 и Node.js 22. Для PDF-теста в системе должен быть DejaVu Sans (`fonts-dejavu-core`); без шрифта этот один тест пропускается, остальные выполняются.
