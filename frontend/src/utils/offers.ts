import type { ApplicationData, LoanOffer } from "../types";
import { isOverdraftGoal, productName } from "./goal";

// Сумма выше оценки: кроме вариантов в пределах оценки, клиент может оставить свою сумму —
// тогда решение примет банк после полной проверки (часто у специалиста). Добавляем это явным вариантом.
export function withRequested(offers: LoanOffer[], data: ApplicationData): LoanOffer[] {
  const high = data.precheck?.amountHigh ?? 0;
  if (!offers.length || high <= 0 || data.amount <= high) return offers;
  const overdraft = isOverdraftGoal(data.goal);
  const term = overdraft ? 12 : data.term;
  if (offers.some((o) => o.amount === data.amount && (o.termMonths == null || o.termMonths === term))) return offers;
  const product = overdraft ? "OVERDRAFT" : "WORKING_CAPITAL";
  return [...offers, {
    name: offers.find((o) => o.product === product)?.name ?? productName(data.goal),
    product,
    amount: data.amount,
    termMonths: term,
    rate: data.quote?.rate,
    monthly: data.quote?.monthly,
    fullCost: data.quote?.fullCost,
    kind: "AS_REQUESTED",
    why: "Сумма выше оценки: решение примет банк после полной проверки",
  }];
}
