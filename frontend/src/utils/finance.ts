// Как движок одобрения видит финансы клиента — те же пороги, что в ml/config/policy.yaml
export type Tone = "green" | "amber" | "red";

// Долговая нагрузка бизнеса: платежи по кредитам / месячный оборот (фактор B_DEBT_RATIO, до 15 баллов)
const debtBins: Array<[number, number]> = [[0.05, 15], [0.1, 12], [0.2, 8], [0.3, 4]];
export const DEBT_MAX_POINTS = 15;
// Платёж по новому кредиту вместе с текущими — не больше 20% оборота (лимит продукта)
export const PAYMENT_SHARE_LIMIT = 0.2;

export function share(payment: number, revenue: number): number | null {
  return revenue > 0 ? Math.max(payment, 0) / revenue : null;
}

export function debtPoints(debtShare: number): number {
  return debtBins.find(([max]) => debtShare <= max)?.[1] ?? 0;
}

export function debtTone(debtShare: number): Tone {
  return debtShare <= 0.1 ? "green" : debtShare <= 0.2 ? "amber" : "red";
}

export function paymentTone(paymentShare: number): Tone {
  return paymentShare <= PAYMENT_SHARE_LIMIT * 0.75 ? "green" : paymentShare <= PAYMENT_SHARE_LIMIT ? "amber" : "red";
}

export const percent = (value: number) => `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: value < 0.1 ? 1 : 0 })}%`;
