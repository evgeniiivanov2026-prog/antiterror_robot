# API AntiTerror Robot

Базовый префикс: `/api/v1`.

Авторизация: `Authorization: tma <Telegram initData>`.

Ошибка всегда выглядит так:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Проверьте введённые данные.",
    "details": [{ "field": "description", "message": "Опишите ситуацию чуть подробнее — хотя бы несколько предложений." }]
  }
}
```

## GET /api/v1/health

Проверка процесса и базы. Тело: `{ "status": "ok" }`.

## GET /api/v1/meta/categories

Список категорий на русском языке. Нужна сессия Telegram.

## POST /api/v1/reports

Создаёт карточку. Уровень срочности считает сервер.

```json
{
  "category": "fraud",
  "description": "Мне написали и просили перейти по ссылке для оплаты несуществующего штрафа.",
  "occurred_at": null,
  "platform": "Telegram",
  "source_url": "https://example.com/post/1",
  "suspect": { "username": "@example" },
  "demands": {
    "summary": "Просили открыть ссылку",
    "asked_for_money": true,
    "asked_for_meeting": false,
    "asked_for_secrecy": false,
    "asked_to_click_link": true
  },
  "contact_consent": false
}
```

Ответ `201` содержит `id`, `public_id`, маску контакта, дисклеймер и напоминание про 112. Полный контакт не возвращается.

## GET /api/v1/reports/{public_id}

Карточка владельца, модератора или администратора. Чужим отвечаем `404`.

## POST /api/v1/reports/{id}/evidence

`multipart/form-data`, поле `file`. До 5 файлов: JPEG, PNG, WEBP, PDF, MP3, OGG, MP4, WEBM. Лимиты: изображения и PDF 10 МБ, аудио 20 МБ, видео 50 МБ.

## POST /api/v1/reports/{id}/export

PDF карточки владельца. В файле есть дисклеймер и маска контакта, без исходного значения.

## POST /api/v1/reports/{id}/send-copy

Отправляет PDF в личный чат владельца с ботом. В подписи нет текста описания. Если человек не нажимал `/start`, Telegram не примет сообщение: API вернёт понятную ошибку, PDF останется доступен для скачивания.

## PATCH /api/v1/reports/{id}/status

Владелец может поставить `forwarded` — это отметка «сохранил для обращения в МВД», а не факт передачи в полицию. Модератор может поставить `under_review` и `closed`.

## DELETE /api/v1/reports/{id}

Удаляет карточку и файлы. Доступно владельцу и сотрудникам сервиса.

## POST /api/v1/emergency

```json
{ "source": "mini_app" }
```

Ответ всегда содержит телефоны 112, 102 и детский телефон доверия. Если запись об обращении не сохранилась, номера всё равно возвращаются.

## POST /api/v1/admin/roles

Только администратор.

```json
{ "telegram_id": 100, "role": "moderator" }
```

## POST /bot/webhook

Приём обновлений Telegram. Заголовок `X-Telegram-Bot-Api-Secret-Token` должен совпасть с `WEBHOOK_SECRET`. Тело обновления в журнал не пишется.
