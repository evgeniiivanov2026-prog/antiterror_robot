# AntiTerror Robot

Telegram-бот [@antiterror_robot](https://t.me/antiterror_robot) и мини-приложение для спокойной фиксации сообщений о мошенничестве, вербовке, шантаже и попытках вовлечь молодого человека в противоправные действия.

Слоган: «Сообщай. Фиксируй. Защищай.»

Сервис **не является** правоохранительным органом. Он помогает записать факты, сохранить файлы и подсказывает, как обратиться в МВД. Он не выдвигает обвинений, не проводит расследование и не обещает проверку. При непосредственной опасности на экране и в боте есть номера **112** и **102**.

## Состав

- `backend/` — FastAPI, SQLAlchemy 2, Alembic, aiogram 3, PostgreSQL, Redis, S3.
- `frontend/` — React 18, TypeScript, Vite, Telegram WebApp.
- `docs/` — конфиденциальность, безопасность и API.

## Локальный запуск

1. Создайте бота в [@BotFather](https://t.me/BotFather) с username `antiterror_robot` и именем AntiTerror Robot. Команда `/newapp` или кнопка меню должна открывать HTTPS-адрес мини-приложения. Токен в репозиторий не кладите.
2. Подготовьте окружение:

```bash
cp .env.example .env
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Вставьте ключ в `CONTACT_ENCRYPTION_KEY`. Для локальной проверки без Telegram можно временно поставить `ALLOW_DEV_AUTH_BYPASS=true` и `BOT_MODE=disabled`. В production обход запрещён.

3. Поднимите сервисы:

```bash
docker compose up --build
```

API: `http://127.0.0.1:8000`. Мини-приложение из контейнера: `http://127.0.0.1:8080`. Миграции применяются при старте backend.

4. Отдельный фронтенд для разработки:

```bash
cd frontend
npm install
npm run dev
```

Vite проксирует `/api` на `127.0.0.1:8000`. Для локального пользователя задайте `VITE_DEV_USER_ID=42` рядом с включённым обходом на backend.

5. Удаление старых карточек:

```bash
docker compose exec backend python -m app.workers.retention
```

Поставьте эту команду в cron. Срок задаёт `RETENTION_DAYS` (по умолчанию 180).

## Проверка

Нужен Python 3.12 и шрифт DejaVu (пакет `fonts-dejavu-core`): он нужен для русского PDF.

```bash
cd backend && python -m pip install -r requirements.txt && python -m pytest
cd frontend && npm install && npm test && npm run build
```

Или одной командой `make test`, если зависимости уже установлены.

## Деплой

1. Замените пароль базы, ключи MinIO, токен бота и ключ шифрования. `APP_ENV=production`, `FORCE_HTTPS=true`, `TRUST_PROXY=true`, `ALLOW_DEV_AUTH_BYPASS=false`.
2. Выпустите сертификат в `nginx/certs/fullchain.pem` и `privkey.pem`. Для локальной репетиции: `sh scripts/generate-dev-certs.sh`. Браузер будет предупреждать о самоподписанном сертификате.
3. Укажите публичный `WEBAPP_URL` на `https://` и выберите режим бота:
   - `polling` — процесс сам забирает сообщения, удобно без белого адреса вебхука;
   - `webhook` — задайте длинный `BOT_WEBHOOK_SECRET` и зарегистрируйте `https://<домен>/api/v1/telegram/webhook`.
4. Запуск с TLS:

```bash
docker compose --profile prod up --build -d
```

Наружу откройте только 443. Порты 8000 и 8080 в compose привязаны к localhost.

Команды бота: `/start`, `/report`, `/emergency`, `/evidence`, `/privacy`.

## Роли

`ADMIN_TELEGRAM_IDS` и `MODERATOR_TELEGRAM_IDS` — списки числовых id через запятую. Модератор закрывает спам. Он не видит расшифрованный контакт и не отправляет карточку в полицию.
