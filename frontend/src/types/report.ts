import type { CategoryId } from "../domain/categories";

export interface Report {
  id: string;
  public_id: string;
  category: CategoryId;
  description: string;
  occurred_at: string | null;
  platform: string;
  source_url: string | null;
  suspect: Record<string, string> | null;
  demands: {
    summary: string;
    asked_for_money: boolean;
    asked_for_meeting: boolean;
    asked_for_secrecy: boolean;
    asked_to_click_link: boolean;
  };
  threat_level: string;
  contact_consent: boolean;
  contact_channel: string | null;
  contact_masked: string | null;
  status: string;
  evidence: Array<{
    id: string;
    file_type: string;
    mime_type: string;
    size_bytes: number;
    checksum: string;
    uploaded_at: string;
  }>;
  created_at: string;
  updated_at: string;
  disclaimer: string;
  safety_notice: string;
}
