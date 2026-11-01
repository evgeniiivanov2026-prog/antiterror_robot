# API

Базовый префикс: `/api/v1`.

Авторизация: заголовок `Authorization: tma <initData>`. Подпись проверяется на сервере секретом бота. В локальной разработке при `ALLOW_DEV_AUTH=true` можно передать `X-Dev-User-Id`.

Ошибка всегда выглядит так:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Проверьте поля формы",
    "details": [{ "field": "description", "message": "Опишите ситуацию хотя бы в нескольких словах" }]
  }
}
```

Секрет из отклонённого поля в ответ не копируется.

## Методы

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/health` | Проверка процесса и базы |
| GET | `/meta/categories` | Категории |
| POST | `/reports` | Создать карточку |
| GET | `/reports/{public_id}` | Прочитать свою карточку |
| POST | `/reports/{id}/evidence` | Приложить файл. `id` — UUID |
| POST | `/reports/{id}/export` | PDF для автора |
| POST | `/reports/{id}/notify` | Кратко отправить карточку в чат с ботом |
| DELETE | `/reports/{public_id}` | Удалить свою карточку и файлы |
| PATCH | `/reports/{public_id}/status` | Смена статуса модератором |
| POST | `/emergency` | Зафиксировать открытие срочной помощи |

## Карточка

Категории: `recruitment`, `fraud`, `blackmail`, `suspicious_account`, `witness`, `emergency`.

Статусы: `new`, `under_review`, `forwarded`, `closed`. `forwarded` не означает, что заявление ушло в МВД.

Уровень срочности считает сервер. Слова об угрозе, насилии, шантаже, ребёнке и срочности дают уровень `immediate`, и клиент показывает 112 и 102.

Описание — от 20 до 4000 символов. Платформа: `telegram`, `vk`, `whatsapp`, `phone`, `email`, `website`, `other`.

Файлы: JPEG, PNG, WEBP, MP4, WEBM, MP3, OGG, WAV, PDF, TXT. Не больше 8 файлов на карточку. Лимиты по умолчанию: фото 10 МБ, видео 25 МБ, аудио 15 МБ, документ 5 МБ.

## Срочная помощь

```json
{ "trigger": "manual" }
```

`trigger` также может быть `keyword` или `category`. В записи нет свободного текста.
