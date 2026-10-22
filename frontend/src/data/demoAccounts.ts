import type { Company } from "../types";
import { goals } from "./application";

export type DemoAccountId = "P1" | "P2" | "P3" | "P4" | "P5" | "ZSK";

export interface DemoAccount {
  id: DemoAccountId;
  label: string;
  company: Company;
  goal: string;
  amount: number;
  term: number;
  monthlyRevenue: number;
  hasLoans: "Да" | "Нет";
  loanPayment: number;
  hadOverdue2y: boolean;
}

const company = (
  inn: string,
  name: string,
  activity: string,
  region: string,
  registrationYear: number,
  averageMonthlyTurnover: number,
  legalForm = "ИП",
): Company => ({ inn, name, legalForm, activity, region, registrationYear, averageMonthlyTurnover });

const polka = company("771500000002", "ООО «Полка»", "Торговля на маркетплейсах, ОКВЭД 47.91", "Москва", 2024, 1_900_000, "ООО");

export const demoAccounts: DemoAccount[] = [
  { id: "P1", label: "P1 · Ольга, кофейня", company: company("631200000001", "ИП Ольга · кофейня", "Кофейня, ОКВЭД 56.10", "Самарская область", 2023, 950_000), goal: goals[1][0], amount: 850_000, term: 24, monthlyRevenue: 950_000, hasLoans: "Да", loanPayment: 20_000, hadOverdue2y: false },
  { id: "P2", label: "P2 · ООО «Полка»", company: polka, goal: goals[1][0], amount: 3_000_000, term: 18, monthlyRevenue: 1_900_000, hasLoans: "Да", loanPayment: 50_000, hadOverdue2y: false },
  { id: "P3", label: "P3 · Тимур, автосервис", company: company("026800000003", "ИП Тимур · автосервис", "Автосервис, ОКВЭД 45.20", "Республика Башкортостан", 2025, 580_000), goal: goals[1][0], amount: 1_200_000, term: 24, monthlyRevenue: 750_000, hasLoans: "Да", loanPayment: 25_000, hadOverdue2y: true },
  { id: "P4", label: "P4 · Марина, студия", company: company("540600000004", "ИП Марина · студия маникюра", "Студия маникюра, ОКВЭД 96.02", "Новосибирская область", 2026, 400_000), goal: goals[1][0], amount: 500_000, term: 12, monthlyRevenue: 400_000, hasLoans: "Да", loanPayment: 10_000, hadOverdue2y: false },
  { id: "P5", label: "P5 · Андрей, стройматериалы", company: company("662300000005", "ИП Андрей · стройматериалы", "Магазин стройматериалов, ОКВЭД 47.52", "Свердловская область", 2025, 550_000), goal: goals[2][0], amount: 300_000, term: 12, monthlyRevenue: 900_000, hasLoans: "Да", loanPayment: 20_000, hadOverdue2y: false },
  { id: "ZSK", label: "ZSK · проверка 115-ФЗ", company: company("770100000099", "ООО «Северный Контур»", "Оптовая торговля, ОКВЭД 46.90", "Москва", 2023, 1_510_000, "ООО"), goal: goals[1][0], amount: 1_000_000, term: 12, monthlyRevenue: 1_500_000, hasLoans: "Нет", loanPayment: 0, hadOverdue2y: false },
];

export const DEFAULT_DEMO_ACCOUNT = demoAccounts[0];
