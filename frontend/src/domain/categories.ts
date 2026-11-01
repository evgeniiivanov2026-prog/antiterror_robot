export type CategoryId =
  | "recruitment"
  | "fraud"
  | "blackmail"
  | "suspicious_account"
  | "witness"
  | "emergency";

export interface Category {
  id: CategoryId;
  title: string;
  description: string;
  suggestsEmergency: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "recruitment",
    title: "Вербовка",
    description: "Склоняют к противоправным действиям, зовут «в команду» или вербуют.",
    suggestsEmergency: false,
  },
  {
    id: "fraud",
    title: "Мошенничество",
    description: "Обман с деньгами, доступами или личными данными.",
    suggestsEmergency: false,
  },
  {
    id: "blackmail",
    title: "Шантаж",
    description: "Угрожают опубликовать сведения или требуют что-то под давлением.",
    suggestsEmergency: true,
  },
  {
    id: "suspicious_account",
    title: "Подозрительный аккаунт или канал",
    description: "Аккаунт, чат или канал выглядит опасно.",
    suggestsEmergency: false,
  },
  {
    id: "witness",
    title: "Я свидетель",
    description: "Вы видели ситуацию со стороны и хотите её зафиксировать.",
    suggestsEmergency: false,
  },
  {
    id: "emergency",
    title: "Срочная опасность",
    description: "Угроза жизни, здоровью или безопасности может быть прямо сейчас.",
    suggestsEmergency: true,
  },
];

export const PLATFORMS = ["Telegram", "ВКонтакте", "WhatsApp", "Сайт", "Телефонный звонок", "Другое"];

export const CATEGORY_LABELS: Record<CategoryId, string> = Object.fromEntries(
  CATEGORIES.map((item) => [item.id, item.title]),
) as Record<CategoryId, string>;

export const THREAT_LABELS: Record<string, string> = {
  low: "Спокойная фиксация",
  medium: "Нужна аккуратность",
  high: "Есть признаки давления",
  critical: "Возможна непосредственная опасность",
};

export const STATUS_LABELS: Record<string, string> = {
  new: "Принято",
  under_review: "Проверяется полнота карточки",
  forwarded: "Сохранено для обращения в МВД",
  closed: "Закрыто",
};

export function categoryById(id: CategoryId | null): Category | undefined {
  return CATEGORIES.find((item) => item.id === id);
}
