import type { Dispatch, SetStateAction } from "react";

export type Outcome = "review" | "approved" | "partial" | "rejected";

export interface ApplicationData {
  goal: string;
  amount: number;
  term: number;
  inn: string;
  companyOk: boolean;
  revenue: string;
  hasLoans: "Да" | "Нет";
  loanPayment: number;
  collateral: string;
  offer: number;
  docs: Record<string, string>;
  consent1: boolean;
  consent2: boolean;
  submitted: boolean;
  outcome: Outcome;
}

export interface LoanOffer {
  name: string;
  amount: string;
  detail: string;
  why: string;
  chance: number;
}

export type UpdateApplication = <K extends keyof ApplicationData>(
  key: K,
  value: ApplicationData[K],
) => void;

export type Navigate = (index?: number) => void;

export interface PageProps {
  data: ApplicationData;
  update: UpdateApplication;
  next: Navigate;
}

export interface AmountPageProps extends PageProps {
  monthly: number;
  total: number;
}

export interface CompanyPageProps extends PageProps {
  setToast: (message: string) => void;
}

export interface FinancePageProps extends PageProps {
  setSelectedOffer: (index: number) => void;
}

export interface OffersPageProps extends PageProps {
  goalOffers: LoanOffer[];
  selectedOffer: number;
  setSelectedOffer: (index: number) => void;
  monthly: number;
  chosen: LoanOffer;
  setToast: (message: string) => void;
}

export interface ReviewPageProps extends PageProps {
  monthly: number;
  submit: () => void;
}

export interface StatusPageProps extends PageProps {
  setData: Dispatch<SetStateAction<ApplicationData>>;
  setScreen: (index: number) => void;
  monthly: number;
  total: number;
}
