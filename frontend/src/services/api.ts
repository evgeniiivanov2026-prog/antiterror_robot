import type { Draft, ReportCard } from "../types/report";

const BASE = import.meta.env.VITE_API_URL || "/api/v1";

export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function authHeaders(json: boolean): Headers {
  const headers = new Headers();
  if (json) headers.set("Content-Type", "application/json");
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers.set("Authorization", `tma ${initData}`);
  else if (import.meta.env.VITE_DEV_USER_ID) headers.set("X-Dev-User-Id", import.meta.env.VITE_DEV_USER_ID);
  return headers;
}

async function fail(response: Response): Promise<never> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; details?: { message?: string }[] } };
    const detail = body.error?.details?.[0]?.message;
    throw new ApiError(body.error?.code ?? "request_failed", detail || body.error?.message || "Не удалось выполнить запрос");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("request_failed", "Не удалось выполнить запрос");
  }
}

export function draftToPayload(draft: Draft) {
  const suspect = {
    display_name: draft.displayName.trim(),
    username: draft.username.trim(),
    channel: draft.suspectChannel.trim(),
  };
  const hasSuspect = Object.values(suspect).some(Boolean);
  return {
    category: draft.category,
    description: draft.description.trim(),
    occurred_at: draft.occurredAt ? new Date(draft.occurredAt).toISOString() : null,
    platform: draft.platform,
    source_url: draft.sourceUrl.trim() || null,
    suspect_identifiers: hasSuspect ? suspect : null,
    demands: {
      asked_for: draft.demandsKind,
      summary: draft.demandsSummary.trim(),
      user_complied: draft.userComplied,
    },
    contact_consent: draft.contactConsent,
    contact_channel: draft.contactConsent ? draft.contactChannel || null : null,
    contact_value: draft.contactConsent ? draft.contactValue.trim() || null : null,
    immediate_danger: draft.immediateDanger,
  };
}

export const api = {
  async createReport(draft: Draft): Promise<ReportCard> {
    const response = await fetch(`${BASE}/reports`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(draftToPayload(draft)),
    });
    if (!response.ok) await fail(response);
    return response.json() as Promise<ReportCard>;
  },

  async uploadEvidence(reportId: string, file: File): Promise<void> {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${BASE}/reports/${reportId}/evidence`, {
      method: "POST",
      headers: authHeaders(false),
      body,
    });
    if (!response.ok) await fail(response);
  },

  async getReport(publicId: string): Promise<ReportCard> {
    const response = await fetch(`${BASE}/reports/${publicId}`, { headers: authHeaders(false) });
    if (!response.ok) await fail(response);
    return response.json() as Promise<ReportCard>;
  },

  async exportPdf(reportId: string): Promise<Blob> {
    const response = await fetch(`${BASE}/reports/${reportId}/export`, {
      method: "POST",
      headers: authHeaders(false),
    });
    if (!response.ok) await fail(response);
    return response.blob();
  },

  async notify(reportId: string): Promise<void> {
    const response = await fetch(`${BASE}/reports/${reportId}/notify`, {
      method: "POST",
      headers: authHeaders(false),
    });
    if (!response.ok) await fail(response);
  },

  async remove(publicId: string): Promise<void> {
    const response = await fetch(`${BASE}/reports/${publicId}`, {
      method: "DELETE",
      headers: authHeaders(false),
    });
    if (!response.ok) await fail(response);
  },

  async emergency(trigger: "manual" | "keyword" | "category"): Promise<void> {
    const response = await fetch(`${BASE}/emergency`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ trigger }),
    });
    if (!response.ok && response.status !== 401) await fail(response);
  },
};
