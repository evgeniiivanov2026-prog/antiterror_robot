export const CATEGORY_IDS = [
  "recruitment",
  "fraud",
  "blackmail",
  "suspicious_account",
  "witness",
  "emergency",
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

export interface CategoryInfo {
  id: CategoryId
  title: string
  description: string
  emergency: boolean
}

export interface SuspectDraft {
  platform: string
  username: string
  displayName: string
  url: string
  phone: string
  note: string
}

export interface DemandsDraft {
  summary: string
  moneyRequested: boolean
  meetingRequested: boolean
  intimateMaterialRequested: boolean
  secrecyRequested: boolean
  other: string
}

export interface Draft {
  category: CategoryId | null
  step: number
  description: string
  occurredAt: string
  platform: string
  sourceUrl: string
  suspect: SuspectDraft
  demands: DemandsDraft
  contactConsent: boolean
  contactChannel: "" | "telegram" | "email" | "phone"
  evidenceConfirmed: boolean
}

export interface EvidenceInfo {
  id: string
  file_type: string
  mime_type: string
  size_bytes: number
  checksum_prefix: string
  uploaded_at: string
}

export interface IncidentCard {
  id: string
  public_id: string
  category: CategoryId
  description: string
  occurred_at: string | null
  platform: string
  source_url: string | null
  suspect_identifiers: {
    platform?: string | null
    username?: string | null
    display_name?: string | null
    url?: string | null
    phone?: string | null
    note?: string | null
  } | null
  demands: {
    summary?: string | null
    money_requested?: boolean
    meeting_requested?: boolean
    intimate_material_requested?: boolean
    secrecy_requested?: boolean
    other?: string | null
  } | null
  threat_level: "low" | "elevated" | "high" | "immediate"
  contact_consent: boolean
  contact_channel: "telegram" | "email" | "phone" | null
  contact_hint: string | null
  status: "new" | "under_review" | "forwarded" | "closed"
  created_at: string
  updated_at: string
  evidence: EvidenceInfo[]
  disclaimer: string
  mvd_recommendation: string
  urgency_note: string
}

export function emptyDraft(): Draft {
  return {
    category: null,
    step: 0,
    description: "",
    occurredAt: "",
    platform: "",
    sourceUrl: "",
    suspect: {
      platform: "",
      username: "",
      displayName: "",
      url: "",
      phone: "",
      note: "",
    },
    demands: {
      summary: "",
      moneyRequested: false,
      meetingRequested: false,
      intimateMaterialRequested: false,
      secrecyRequested: false,
      other: "",
    },
    contactConsent: false,
    contactChannel: "",
    evidenceConfirmed: false,
  }
}
