import type { CategoryId } from "./categories";
import { findSecret } from "./safety";

export const STORAGE_KEY = "atr-draft-v1";

export interface DraftSuspect {
  display_name: string;
  username: string;
  platform_id: string;
  channel: string;
  phone: string;
  note: string;
}

export interface DraftDemands {
  summary: string;
  askedForMoney: boolean;
  askedForMeeting: boolean;
  askedForSecrecy: boolean;
  askedToClickLink: boolean;
}

export interface Draft {
  category: CategoryId | null;
  description: string;
  occurredAt: string;
  platformChoice: string;
  platformCustom: string;
  sourceUrl: string;
  suspect: DraftSuspect;
  demands: DraftDemands;
  files: File[];
  contactConsent: boolean;
  contactChannel: "" | "telegram" | "phone" | "email";
  contactValue: string;
}

export interface ReportPayload {
  category: CategoryId;
  description: string;
  occurred_at: string | null;
  platform: string;
  source_url: string | null;
  suspect: Partial<DraftSuspect> | null;
  demands: {
    summary: string;
    asked_for_money: boolean;
    asked_for_meeting: boolean;
    asked_for_secrecy: boolean;
    asked_to_click_link: boolean;
  };
  contact_consent: boolean;
  contact_channel: Draft["contactChannel"] | null;
  contact_value: string | null;
}

export function emptySuspect(): DraftSuspect {
  return { display_name: "", username: "", platform_id: "", channel: "", phone: "", note: "" };
}

export function emptyDemands(): DraftDemands {
  return {
    summary: "",
    askedForMoney: false,
    askedForMeeting: false,
    askedForSecrecy: false,
    askedToClickLink: false,
  };
}

export function emptyDraft(): Draft {
  return {
    category: null,
    description: "",
    occurredAt: "",
    platformChoice: "",
    platformCustom: "",
    sourceUrl: "",
    suspect: emptySuspect(),
    demands: emptyDemands(),
    files: [],
    contactConsent: false,
    contactChannel: "",
    contactValue: "",
  };
}

export function platformValue(draft: Draft): string {
  if (draft.platformChoice === "Другое") return draft.platformCustom.trim();
  return draft.platformChoice.trim();
}

export function hasMeaningfulDraft(draft: Draft): boolean {
  return Boolean(draft.category || draft.description.trim() || draft.platformChoice);
}

export function saveStoredDraft(draft: Draft): void {
  const { contactValue: _contact, files: _files, ...rest } = draft;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
}

export function clearStoredDraft(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadStoredDraft(): Draft {
  const base = emptyDraft();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      ...base,
      ...parsed,
      contactValue: "",
      files: [],
      suspect: { ...base.suspect, ...(parsed.suspect ?? {}) },
      demands: { ...base.demands, ...(parsed.demands ?? {}) },
    };
  } catch {
    return base;
  }
}

export function toReportPayload(draft: Draft): ReportPayload {
  if (!draft.category) {
    throw new Error("Category is required");
  }
  const suspectEntries = Object.entries(draft.suspect).filter(([, value]) => value.trim());
  return {
    category: draft.category,
    description: draft.description.trim(),
    occurred_at: draft.occurredAt ? new Date(draft.occurredAt).toISOString() : null,
    platform: platformValue(draft),
    source_url: draft.sourceUrl.trim() || null,
    suspect: suspectEntries.length ? Object.fromEntries(suspectEntries.map(([key, value]) => [key, value.trim()])) : null,
    demands: {
      summary: draft.demands.summary.trim(),
      asked_for_money: draft.demands.askedForMoney,
      asked_for_meeting: draft.demands.askedForMeeting,
      asked_for_secrecy: draft.demands.askedForSecrecy,
      asked_to_click_link: draft.demands.askedToClickLink,
    },
    contact_consent: draft.contactConsent,
    contact_channel: draft.contactConsent ? draft.contactChannel || null : null,
    contact_value: draft.contactConsent ? draft.contactValue.trim() || null : null,
  };
}

export function validateDescription(value: string): string | null {
  const text = value.trim();
  if (text.length < 20) return "Опишите ситуацию чуть подробнее — хотя бы несколько предложений.";
  if (text.length > 4000) return "Сократите текст до 4000 символов.";
  return findSecret(text);
}

export function validatePlatform(draft: Draft): string | null {
  if (!draft.platformChoice) return "Укажите, где это произошло.";
  if (platformValue(draft).length < 2) return "Напишите, что это была за площадка.";
  return null;
}

export function validateOccurredAt(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Проверьте дату и время.";
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return "Дата не может быть в будущем.";
  return null;
}

export function validateUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Укажите ссылку, которая начинается с http:// или https://.";
    }
  } catch {
    return "Укажите ссылку, которая начинается с http:// или https://.";
  }
  return null;
}

export function validateContact(draft: Draft): string | null {
  if (!draft.contactConsent) return null;
  if (!draft.contactChannel) return "Выберите способ связи.";
  if (!draft.contactValue.trim()) return "Укажите контакт для обратной связи.";
  return findSecret(draft.contactValue);
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/ogg",
  "audio/mpeg",
  "video/mp4",
  "video/webm",
]);

export function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Принимаются только JPEG, PNG, WEBP, PDF, MP3, OGG, MP4 и WEBM.";
  }
  const kind = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : "document";
  const limits: Record<string, number> = {
    image: 10 * 1024 * 1024,
    audio: 20 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    document: 10 * 1024 * 1024,
  };
  if (file.size > limits[kind]) return "Файл больше допустимого размера.";
  const parts = file.name.toLowerCase().split(".").filter(Boolean);
  if (parts.length >= 3) return "Имя файла выглядит подозрительно. Переименуйте его.";
  return null;
}
