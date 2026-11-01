import type { ReportPayload } from "../domain/draft";
import type { Report } from "../types/report";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function authHeaders(): Headers {
  const headers = new Headers();
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) {
    headers.set("Authorization", `tma ${initData}`);
  } else if (import.meta.env.DEV && import.meta.env.VITE_DEV_TELEGRAM_ID) {
    headers.set("X-Dev-Telegram-Id", import.meta.env.VITE_DEV_TELEGRAM_ID);
  }
  return headers;
}

async function parseError(response: Response): Promise<never> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: Array<{ message?: string }> };
    };
    const detail = body.error?.details?.[0]?.message;
    throw new ApiError(detail || body.error?.message || "Не получилось выполнить запрос.", body.error?.code || "http_error");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Не получилось выполнить запрос. Если опасность сейчас — звоните 112 или 102.", "network");
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders();
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Нет соединения. Проверьте интернет. Если опасность сейчас — звоните 112 или 102.", "network");
  }
  if (!response.ok) await parseError(response);
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) return (await response.blob()) as T;
  return (await response.json()) as T;
}

export function createReport(payload: ReportPayload): Promise<Report> {
  return request<Report>("/api/v1/reports", { method: "POST", body: JSON.stringify(payload) });
}

export function getReport(publicId: string): Promise<Report> {
  return request<Report>(`/api/v1/reports/${publicId}`);
}

export function uploadEvidence(reportId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  return request<void>(`/api/v1/reports/${reportId}/evidence`, { method: "POST", body: form });
}

export function exportPdf(reportId: string): Promise<Blob> {
  return request<Blob>(`/api/v1/reports/${reportId}/export`, { method: "POST" });
}

export function sendCopy(reportId: string): Promise<void> {
  return request<void>(`/api/v1/reports/${reportId}/send-copy`, { method: "POST" });
}

export function updateStatus(reportId: string, status: string): Promise<Report> {
  return request<Report>(`/api/v1/reports/${reportId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteReport(reportId: string): Promise<void> {
  return request<void>(`/api/v1/reports/${reportId}`, { method: "DELETE" });
}

export function recordEmergency(): Promise<unknown> {
  return request("/api/v1/emergency", { method: "POST", body: JSON.stringify({ source: "mini_app" }) });
}
