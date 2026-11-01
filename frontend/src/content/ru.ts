import type { CategoryId, DemandKind, PlatformId } from "../types/report";

export const SLOGAN = "Сообщай. Фиксируй. Защищай.";

export const DISCLAIMER =
  "AntiTerror Robot не является правоохранительным органом и не заменяет обращение в полицию.";

export const SECRET_MESSAGE =
  "Уберите пароли, коды из SMS, CVV и полные номера карт. Опишите ситуацию своими словами.";

export const CATEGORIES: { id: CategoryId; title: string; text: string }[] = [
  {
    id: "recruitment",
    title: "Вербовка",
    text: "Склоняют к противоправным действиям, зовут в закрытый чат или на встречу.",
  },
  {
    id: "fraud",
    title: "Мошенничество",
    text: "Выманивают деньги, коды, доступ или данные под видом помощи и заработка.",
  },
  {
    id: "blackmail",
    title: "Шантаж",
    text: "Угрожают опубликовать сведения или причинить вред, если не выполнить требования.",
  },
  {
    id: "suspicious_account",
    title: "Подозрительный аккаунт или канал",
    text: "Аккаунт, канал или чат выглядит как вербовка, давление или обман.",
  },
  {
    id: "witness",
    title: "Я свидетель",
    text: "Вы видели, как вовлекают другого человека, и хотите это зафиксировать.",
  },
  {
    id: "emergency",
    title: "Срочная опасность",
    text: "Угроза жизни или здоровью происходит прямо сейчас.",
  },
];

export const PLATFORMS: { id: PlatformId; title: string }[] = [
  { id: "telegram", title: "Telegram" },
  { id: "vk", title: "ВКонтакте" },
  { id: "whatsapp", title: "WhatsApp" },
  { id: "phone", title: "Телефон" },
  { id: "email", title: "Почта" },
  { id: "website", title: "Сайт" },
  { id: "other", title: "Другое" },
];

export const DEMANDS: { id: DemandKind; title: string }[] = [
  { id: "none", title: "Явных требований не было" },
  { id: "money", title: "Деньги" },
  { id: "personal_data", title: "Личные данные или доступ" },
  { id: "meeting", title: "Встреча" },
  { id: "actions", title: "Что-то сделать" },
  { id: "other", title: "Другое" },
];

export const STEP_TITLES = [
  "Что произошло",
  "Где и когда",
  "О ком речь",
  "Что требовали",
  "Доказательства",
  "Проверка",
];

export function categoryTitle(id: string): string {
  return CATEGORIES.find((item) => item.id === id)?.title ?? id;
}

export function platformTitle(id: string): string {
  return PLATFORMS.find((item) => item.id === id)?.title ?? id;
}
