import type { CategoryInfo, IncidentCard } from "../types/incident"

export interface SessionProfile {
  role: "user" | "moderator" | "admin"
  telegram_id: number
}

export interface ModerationItem {
  id: string
  public_id: string
  category: IncidentCard["category"]
  threat_level: IncidentCard["threat_level"]
  status: IncidentCard["status"]
  created_at: string
}

export class ApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = "ApiError"
  }
}

function authHeaders(json: boolean): Headers {
  const headers = new Headers()
  if (json) headers.set("Content-Type", "application/json")
  const initData = window.Telegram?.WebApp?.initData
  if (initData) headers.set("Authorization", `tma ${initData}`)
  else if (import.meta.env.VITE_DEV_USER_ID) headers.set("X-Dev-User-Id", import.meta.env.VITE_DEV_USER_ID)
  return headers
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
  let code = "http_error"
  let message = "Не удалось выполнить запрос. Попробуйте ещё раз."
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } }
    code = body.error?.code || code
    message = body.error?.message || message
  } catch {
    // Keep the generic message when the server returns an empty body.
  }
  throw new ApiError(code, message)
}

const root = import.meta.env.VITE_API_BASE ?? ""

export const api = {
  async categories(): Promise<{ categories: CategoryInfo[]; disclaimer: string }> {
    const response = await fetch(`${root}/api/v1/meta/categories`)
    return parse(response)
  },
  async createReport(body: unknown): Promise<IncidentCard> {
    const response = await fetch(`${root}/api/v1/reports`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(body),
    })
    return parse(response)
  },
  async uploadEvidence(reportId: string, file: File): Promise<void> {
    const data = new FormData()
    data.append("file", file)
    const response = await fetch(`${root}/api/v1/reports/${reportId}/evidence`, {
      method: "POST",
      headers: authHeaders(false),
      body: data,
    })
    await parse(response)
  },
  async exportPdf(reportId: string): Promise<Blob> {
    const response = await fetch(`${root}/api/v1/reports/${reportId}/export`, {
      method: "POST",
      headers: authHeaders(false),
    })
    if (!response.ok) await parse(response)
    return response.blob()
  },
  async sendToChat(reportId: string): Promise<void> {
    const response = await fetch(`${root}/api/v1/reports/${reportId}/send-to-chat`, {
      method: "POST",
      headers: authHeaders(false),
    })
    await parse(response)
  },
  async markReferred(reportId: string): Promise<IncidentCard> {
    const response = await fetch(`${root}/api/v1/reports/${reportId}/mark-referred`, {
      method: "POST",
      headers: authHeaders(false),
    })
    return parse(response)
  },
  async removeReport(reportId: string): Promise<void> {
    const response = await fetch(`${root}/api/v1/reports/${reportId}`, {
      method: "DELETE",
      headers: authHeaders(false),
    })
    await parse(response)
  },
  async session(): Promise<SessionProfile> {
    const response = await fetch(`${root}/api/v1/me`, { headers: authHeaders(false) })
    return parse(response)
  },
  async moderationReports(): Promise<ModerationItem[]> {
    const response = await fetch(`${root}/api/v1/moderation/reports`, { headers: authHeaders(false) })
    return parse(response)
  },
  async moderationReport(reportId: string): Promise<IncidentCard> {
    const response = await fetch(`${root}/api/v1/moderation/reports/${reportId}`, { headers: authHeaders(false) })
    return parse(response)
  },
  async moderationClose(reportId: string, status: "under_review" | "closed", reason: string): Promise<void> {
    const response = await fetch(`${root}/api/v1/moderation/reports/${reportId}/close`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ status, reason }),
    })
    await parse(response)
  },
  async notifyEmergency(): Promise<void> {
    const response = await fetch(`${root}/api/v1/emergency`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ source: "miniapp" }),
    })
    await parse(response)
  },
}
