import { describe, expect, it } from "vitest";
import { defaultData } from "../data/application";
import type { ApplicationData, LoanOffer } from "../types";
import { withRequested } from "./offers";

const offer: LoanOffer = { name: "Деньги на текущие расходы", product: "WORKING_CAPITAL", amount: 2_850_000, termMonths: 18, kind: "WITHIN_ESTIMATE" };
const data = (amount: number): ApplicationData => ({
  ...defaultData, goal: "Закупить товар или материалы", amount, term: 18,
  quote: { monthly: 194_290, total: 3_497_213, fullCost: 527_213, rate: 20 },
  precheck: { amountLow: 2_550_000, amountHigh: 2_850_000, chance: "MEDIUM", reasons: [], text: "", goalOffers: [offer] },
});

describe("вариант «как просили»", () => {
  it("добавляется, когда сумма выше оценки", () => {
    const list = withRequested([offer], data(3_000_000));
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ kind: "AS_REQUESTED", amount: 3_000_000, termMonths: 18, monthly: 194_290, fullCost: 527_213 });
  });
  it("не добавляется, если сумма в пределах оценки или уже есть среди вариантов", () => {
    expect(withRequested([offer], data(2_000_000))).toHaveLength(1);
    expect(withRequested([{ ...offer, amount: 3_000_000 }], data(3_000_000))).toHaveLength(1);
  });
});
