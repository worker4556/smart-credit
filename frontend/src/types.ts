import type { Dispatch, SetStateAction } from "react";

export type Outcome = "review" | "specialist" | "approved" | "partial" | "info" | "rejected" | "suspended";
export type Role = "CLIENT" | "SPECIALIST" | "ADMIN";
export type PersonaId = string;
export interface Quote { monthly: number; total: number; fullCost?: number; rate?: number; disclaimer?: string; }
// «Погода»: полная стоимость сейчас, при росте ставки и при задержке платежа (ml/config/policy.yaml → weather)
export interface WeatherRow { code: "BASE" | "RATE_UP" | "OVERDUE_30"; title: string; rate: number; monthlyPayment: number; fullCost: number; deltaFullCost: number; note?: string | null; }
export interface Weather { rows: WeatherRow[]; disclaimer: string; }
export interface Precheck { amountLow: number; amountHigh: number; chance: string; ownerNote?: string | null; reasons: Array<{ code?: string; text: string }>; text: string; disclaimer?: string; goalOffers: LoanOffer[]; weather?: Weather | null; }
export interface Decision { decisionText?: string; decisionAmount?: number; decisionRate?: number; decisionMonthly?: number; reasons?: string[]; }
export interface RouteStep { code: string; action: string; term: string; done: boolean; pointsGain?: number; bkiDelayBusinessDays?: number | null; targetTurnover?: number | null; }
export interface ApplicationRoute { status?: string; holds?: string; basedOn?: string; steps: RouteStep[]; horizonText?: string; message?: string; advice?: string[]; projectedAmount?: number | null; disclaimer?: string; text?: string; }
export interface Company { inn: string; name: string; legalForm?: string; okved?: string; activity?: string; region?: string; registrationYear?: number; averageMonthlyTurnover?: number; turnoverMonthly?: number[]; }
export interface ActivityEvent { at: string; text: string; }
export interface ApplicationData {
  applicationId?: string; number?: string; status?: string; intentText?: string; goal: string; amount: number; term: number; inn: string; companyOk: boolean; monthlyRevenue: number;
  hasLoans: "Да" | "Нет"; loanPayment: number; hadOverdue2y: boolean; collateral: string; offer: number; docs: Record<string, string>;
  consent1: boolean; consent2: boolean; submitted: boolean; outcome: Outcome; quote?: Quote; precheck?: Precheck; goalOffers?: LoanOffer[]; decision?: Decision;
  decisionText?: string; decisionAmount?: number; decisionRate?: number; decisionMonthly?: number; decisionTerm?: number; decisionFullCost?: number; reasons?: string[];
  route?: ApplicationRoute; company?: Company; activity: ActivityEvent[]; infoRequest?: { text: string; dueDate: string } | null;
  /** Шаги маршрута, выполненные до этой заявки: банк оценит её с их учётом */
  routeDone?: string[];
}
export interface LoanOffer { name: string; amount: string | number; detail?: string; why?: string; chance?: string; kind?: string; product?: string; termMonths?: number; rate?: number; monthly?: number; fullCost?: number; weather?: Weather | null; }
export type UpdateApplication = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => void;
export type Navigate = (index?: number) => void;
export interface PageProps { data: ApplicationData; update: UpdateApplication; next: Navigate; }
export interface CompanyPageProps extends PageProps { lookupCompany: (inn: string) => Promise<Company>; profileCompany?: Company; setToast: (message: string) => void; }
export interface FinancePageProps extends PageProps { setSelectedOffer: (index: number) => void; company?: Company; onShowOffers: () => Promise<void>; }
export interface GoalPageProps extends PageProps { selectPersona?: (id: PersonaId) => void; previewOffers?: () => Promise<LoanOffer[]>; }
export interface OffersPageProps extends PageProps { goalOffers: LoanOffer[]; selectedOffer: number; setSelectedOffer: (index: number) => void; monthly: number; chosen?: LoanOffer; setToast: (message: string) => void; onChoose: () => Promise<void>; onOpenRoute?: () => void; }
export interface ReviewPageProps extends PageProps { monthly: number; submit: () => void; loading: boolean; }
export interface DocumentsPageProps extends PageProps { uploadFile: (file: File, docId: string) => Promise<void>; }
export interface StatusPageProps extends PageProps { setData: Dispatch<SetStateAction<ApplicationData>>; setScreen: (index: number) => void; monthly: number; total: number; uploadDocument: (file: File, docId?: string) => Promise<void>; acceptOffer: () => Promise<void>; signOffer: () => Promise<void>; declineOffer: () => Promise<void>; withdrawApplication: () => Promise<void>; onNewApplication: () => Promise<void>; recalculateRoute: (doneSteps: string[]) => Promise<void>; onOpenRoute?: () => void; }
