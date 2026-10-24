import type { ApplicationData } from "../types";

// Поля черновика, от которых зависит предоценка: если они не менялись с последнего расчёта, пересчитывать не нужно
export function precheckKey(data: ApplicationData): string {
  return JSON.stringify([data.goal, data.amount, data.term, data.monthlyRevenue, data.hasLoans, data.loanPayment, data.hadOverdue2y]);
}
