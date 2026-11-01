# AntiTerror Robot

Telegram Mini App и бот [@antiterror_robot](https://t.me/antiterror_robot).

**Сообщай. Фиксируй. Защищай.**

Сервис помогает спокойно зафиксировать сообщение о мошенничестве, вербовке, шантаже или попытке вовлечь молодого человека в противоправные действия. Он сохраняет карточку инцидента и подсказывает, как обратиться в МВД.

Это не правоохранительный орган. Бот не ведёт расследование, никого не обвиняет, не передаёт карточку в полицию автоматически и не обещает, что сообщение проверят.

Если опасность есть прямо сейчас, нужно звонить **112** или **102**.

## Что есть в MVP

- Карточка инцидента: категория, описание, время, площадка, требования, файлы и необязательный контакт.
- Экран срочной помощи с кнопками 112 и 102 и подсказкой для несовершеннолетних.
- Пошаговая форма, черновик в браузере и проверка опасных формулировок.
- Бот с командами `/start`, `/report`, `/emergency`, `/evidence`, `/privacy`.
- Проверка Telegram `initData`, шифрование контакта, ограничение частоты, срок хранения 180 дней и удаление по запросу.

## Локальный запуск

Нужны Docker и Docker Compose.

```bash
cp .env.example .env
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Вставьте выведенный ключ в `ENCRYPTION_KEY`. Замените `POSTGRES_PASSWORD` и тот же пароль внутри `DATABASE_URL`. `BOT_TOKEN` оставьте пустым, пока бот не создан в BotFather.

```bash
docker compose up --build
```

Интерфейс: [https://localhost:8443](https://localhost:8443). Сертификат локальный, браузер попросит подтвердить исключение. HTTP на порту 8080 перенаправляет на HTTPS.

API внутри сети Docker слушает только backend. Снаружи открыты порты web-контейнера.

### Бот

1. В BotFather создайте бота с username `antiterror_robot` и именем AntiTerror Robot.
2. Впишите токен в `BOT_TOKEN`.
3. Для локальной отладки команд не задавайте `WEBHOOK_URL` и запустите polling:

```bash
docker compose --profile bot up --build
```

4. Для Telegram Mini App нужен публичный HTTPS-адрес. Укажите его в `WEBAPP_URL`. В проде укажите `WEBHOOK_URL=https://<домен>/bot/webhook` и `WEBHOOK_SECRET` длиной от 16 символов, а профиль `bot` не запускайте: опрос и webhook вместе работать не должны.

### Интерфейс без Telegram

Полный Docker-образ фронтенда не отправляет заголовок локальной авторизации. Для проверки формы в браузере:

```bash
# терминал 1: postgres и redis можно поднять из compose, API — локально
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export ENVIRONMENT=development
export DATABASE_URL=postgresql+asyncpg://antiterror:<пароль>@localhost:5432/antiterror
export ENCRYPTION_KEY=<ключ>
export ALLOW_DEV_AUTH=true
export RATE_LIMIT_BACKEND=memory
export BOT_TOKEN=
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload

# терминал 2
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Откройте [http://localhost:5173](http://localhost:5173). `ALLOW_DEV_AUTH` нельзя включать в production: приложение откажется стартовать.

## Проверки

```bash
cd backend && .venv/bin/pytest
cd frontend && npm test && npm run build
```

Ручной сценарий:

1. На главном экране видны слоган и кнопки «Сообщить о происшествии» и «Срочная помощь».
2. «Срочная помощь» открывает ссылки `tel:112` и `tel:102`.
3. Категория «Мошенничество» открывает описание. Короткий текст не проходит дальше.
4. Фраза со словом «срочно» или «угроза» открывает экран звонка до сохранения.
5. Заполненная форма создаёт карточку `ATR-…`, PDF и, после `/start` у бота, копию в чат.
6. В тексте нельзя оставить номер карты, пароль, CVV или код из СМС.
7. Чужой `public_id` возвращает 404. Свою карточку можно удалить.

## Документы

- [Политика данных](docs/PRIVACY.md)
- [Безопасность](docs/SECURITY.md)
- [API](docs/API.md)

Удаление просроченных карточек:

```bash
python -m app.workers.retention
```
