import type { ApplicationData, ApplicationRoute, Company, Decision, LoanOffer, Precheck, Quote } from "./types";

const API = import.meta.env.VITE_API_URL ?? "/api/v1";
const TOKEN_KEY = "credit-access-token";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function saveToken(token: string) { sessionStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (authenticated && !token) {
    window.dispatchEvent(new Event("api:unauthorized"));
    throw new ApiError(401, "Требуется войти в учётную запись");
  }
  if (authenticated && token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...init, headers });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try { const parsed = JSON.parse(raw) as { detail?: string; message?: string; error?: string }; message = parsed.detail ?? parsed.message ?? parsed.error ?? raw; } catch { /* Plain text response */ }
    if (response.status === 401 && authenticated) {
      clearToken();
      window.dispatchEvent(new Event("api:unauthorized"));
    }
    throw new ApiError(response.status, message || `Ошибка запроса (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface UserProfile { id: string; login: string; name: string; role: "CLIENT" | "SPECIALIST" | "ADMIN"; company: Company | null; phone?: string | null; }
export interface LoginResponse { accessToken: string; user: UserProfile; }
export interface ApplicationResponse extends Partial<ApplicationData> { id?: string; applicationId?: string; outcome: ApplicationData["outcome"]; decisionText?: string; decisionAmount?: number; decisionRate?: number; decisionMonthly?: number; reasons?: string[]; activity?: ApplicationData["activity"]; }
export interface PrecheckResponse extends Precheck { goalOffers: LoanOffer[]; amountLow: number; amountHigh: number; text: string; }

export const api = {
  login: (login: string, password: string) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ login, password }) }, false),
  me: () => request<UserProfile>("/me"),
  company: (inn: string) => request<Company>(`/companies/${encodeURIComponent(inn)}`),
  quote: (goal: string, amount: number, term: number) => request<Quote>("/quote", { method: "POST", body: JSON.stringify({ goal, amount, term }) }),
  createApplication: (data: ApplicationData) => request<ApplicationResponse>("/applications", { method: "POST", body: JSON.stringify(data) }),
  updateApplication: (id: string, data: ApplicationData) => request<ApplicationResponse>(`/applications/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  precheck: (id: string) => request<PrecheckResponse>(`/applications/${id}/precheck`, { method: "POST" }),
  submit: (id: string, data: ApplicationData) => request<ApplicationResponse>(`/applications/${id}/submit`, { method: "POST", body: JSON.stringify(data) }),
  application: (id: string) => request<ApplicationResponse>(`/applications/${id}`),
  route: (id: string) => request<ApplicationRoute>(`/applications/${id}/route`, { method: "POST" }),
  recalculateRoute: (id: string, doneSteps: string[]) => request<ApplicationRoute>(`/applications/${id}/route/recalculate`, { method: "POST", body: JSON.stringify({ done: doneSteps }) }),
  uploadDocument: (id: string, file: File) => { const form = new FormData(); form.append("file", file); return request<ApplicationResponse>(`/applications/${id}/documents`, { method: "POST", body: form }); },
  accept: (id: string) => request<void>(`/applications/${id}/accept`, { method: "POST" }),
};
