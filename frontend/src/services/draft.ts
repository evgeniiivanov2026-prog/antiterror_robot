import { CATEGORY_IDS, type CategoryId, type Draft, emptyDraft } from "../types/incident"

const KEY = "atr-draft-v1"

function isCategory(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as readonly string[]).includes(value)
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Draft>
    const base = emptyDraft()
    const step = typeof parsed.step === "number" && Number.isFinite(parsed.step) ? Math.min(5, Math.max(0, parsed.step)) : 0
    return {
      ...base,
      category: isCategory(parsed.category) ? parsed.category : null,
      step,
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 4000) : "",
      occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : "",
      platform: typeof parsed.platform === "string" ? parsed.platform.slice(0, 80) : "",
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl.slice(0, 500) : "",
      suspect: { ...base.suspect, ...(parsed.suspect ?? {}) },
      demands: { ...base.demands, ...(parsed.demands ?? {}) },
      contactConsent: Boolean(parsed.contactConsent),
      contactChannel:
        parsed.contactChannel === "telegram" || parsed.contactChannel === "email" || parsed.contactChannel === "phone"
          ? parsed.contactChannel
          : "",
      evidenceConfirmed: Boolean(parsed.evidenceConfirmed),
    }
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft): void {
  const stored = {
    category: draft.category,
    step: draft.step,
    description: draft.description,
    occurredAt: draft.occurredAt,
    platform: draft.platform,
    sourceUrl: draft.sourceUrl,
    suspect: draft.suspect,
    demands: draft.demands,
    contactConsent: draft.contactConsent,
    contactChannel: draft.contactChannel,
    evidenceConfirmed: draft.evidenceConfirmed,
  }
  localStorage.setItem(KEY, JSON.stringify(stored))
}

export function clearDraft(): void {
  localStorage.removeItem(KEY)
}
