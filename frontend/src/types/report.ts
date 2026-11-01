export type CategoryId =
  | "recruitment"
  | "fraud"
  | "blackmail"
  | "suspicious_account"
  | "witness"
  | "emergency";

export type PlatformId = "telegram" | "vk" | "whatsapp" | "phone" | "email" | "website" | "other";

export type DemandKind = "none" | "money" | "personal_data" | "meeting" | "actions" | "other";

export type ContactChannel = "telegram" | "phone" | "email";

export type Draft = {
  category: CategoryId | "";
  step: number;
  description: string;
  occurredAt: string;
  platform: PlatformId;
  sourceUrl: string;
  displayName: string;
  username: string;
  suspectChannel: string;
  demandsKind: DemandKind;
  demandsSummary: string;
  userComplied: boolean;
  contactConsent: boolean;
  contactChannel: ContactChannel | "";
  contactValue: string;
  evidenceConfirmed: boolean;
  immediateDanger: boolean;
};

export type EvidenceItem = {
  id: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  uploaded_at: string;
};

export type ReportCard = {
  id: string;
  public_id: string;
  category: string;
  description: string;
  occurred_at: string | null;
  platform: string;
  source_url: string | null;
  suspect_identifiers: Record<string, string> | null;
  demands: { asked_for: string; summary: string; user_complied: boolean };
  threat_level: string;
  status: string;
  contact_consent: boolean;
  contact_channel: string | null;
  contact_value: string | null;
  created_at: string;
  evidence: EvidenceItem[];
  emergency_recommended: boolean;
  safety_notice: string;
};
