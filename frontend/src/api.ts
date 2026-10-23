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
export interface IntentResponse { goal: string | null; amount: number | null; term: number | null; missing: string[]; productReason?: string; needsConfirmation: boolean; source: string; }
export interface AssistantAnswer { answer: string; source: "TEMPLATE" | "LLM"; topic: string; terms: string[]; }

export interface BankQueueItem { applicationId: string; number: string; companyName: string; amount: number; triggers: string[]; waitingMinutes: number; }
export interface BankFactor { label: string; points: number; maxPoints: number; }
export interface BankApplication { applicationId: string; number: string; status: string; outcome: string; decisionText?: string | null; decisionAmount?: number | null; decisionTerm?: number | null; decisionMonthly?: number | null; reasons: string[]; factors: BankFactor[]; stops: string[]; limits: Record<string, number>; recommendation: { outcome: string; amount?: number | null }; events: ActivityEventOut[]; activity: ActivityEventOut[]; }
export interface ActivityEventOut { at: string; text: string; }
export interface BankReason { code: string; kind: string; category: string; text: string; }
export interface BankDecision { outcome: "APPROVED" | "COUNTER_OFFER" | "INFO_REQUESTED" | "REJECTED"; amount?: number; term?: number; reasonCode: string; comment: string; }
export interface AdminApplication { applicationId: string; number: string; companyName: string; amount: number; status: string; outcome: string; decidedBy?: string | null; }
export interface AdminSystem { backend: string; ml: string; llm: { enabled: boolean; ready: boolean; model?: string | null }; policyVersion?: string | null; }

export const api = {
  login: (login: string, password: string) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ login, password }) }, false),
  me: () => request<UserProfile>("/me"),
  company: (inn: string) => request<Company>(`/companies/${encodeURIComponent(inn)}`),
  quote: (goal: string, amount: number, term: number) => request<Quote>("/quote", { method: "POST", body: JSON.stringify({ goal, amount, term }) }),
  intent: (text: string) => request<IntentResponse>("/intent", { method: "POST", body: JSON.stringify({ text }) }),
  assistant: (id: string, question: string, useLlm: boolean) => request<AssistantAnswer>(`/applications/${encodeURIComponent(id)}/assistant`, { method: "POST", body: JSON.stringify({ question, useLlm }) }),
  applications: () => request<ApplicationResponse[]>("/applications"),
  createApplication: (data: ApplicationData) => request<ApplicationResponse>("/applications", { method: "POST", body: JSON.stringify(data) }),
  updateApplication: (id: string, data: ApplicationData) => request<ApplicationResponse>(`/applications/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  precheck: (id: string) => request<PrecheckResponse>(`/applications/${id}/precheck`, { method: "POST" }),
  submit: (id: string, data: ApplicationData) => request<ApplicationResponse>(`/applications/${id}/submit`, { method: "POST", body: JSON.stringify(data) }),
  application: (id: string) => request<ApplicationResponse>(`/applications/${id}`),
  route: (id: string) => request<ApplicationRoute>(`/applications/${id}/route`, { method: "POST" }),
  recalculateRoute: (id: string, doneSteps: string[]) => request<ApplicationRoute>(`/applications/${id}/route/recalculate`, { method: "POST", body: JSON.stringify({ doneSteps }) }),
  uploadDocument: (id: string, file: File, docId?: string) => { const form = new FormData(); form.append("file", file); if (docId) form.append("docId", docId); return request<ApplicationResponse>(`/applications/${id}/documents`, { method: "POST", body: form }); },
  accept: (id: string) => request<void>(`/applications/${id}/accept`, { method: "POST" }),
  sign: (id: string) => request<void>(`/applications/${id}/sign`, { method: "POST" }),
  decline: (id: string) => request<void>(`/applications/${id}/decline`, { method: "POST" }),
  withdraw: (id: string) => request<void>(`/applications/${id}/withdraw`, { method: "POST" }),
  // Кабинет специалиста
  bankQueue: () => request<BankQueueItem[]>("/bank/queue"),
  bankApplication: (id: string) => request<BankApplication>(`/bank/applications/${id}`),
  bankReasons: () => request<{ items: BankReason[] }>("/bank/reasons"),
  bankDecision: (id: string, body: BankDecision) => request<void>(`/bank/applications/${id}/decision`, { method: "POST", body: JSON.stringify(body) }),
  // Админка
  adminApplications: () => request<AdminApplication[]>("/admin/applications"),
  adminSystem: () => request<AdminSystem>("/admin/system"),
  adminReset: () => request<void>("/admin/demo/reset", { method: "POST" }),
};
