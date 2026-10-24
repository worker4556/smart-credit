import { describe, expect, it } from "vitest";
import { defaultData } from "../data/application";
import { precheckKey } from "./precheckKey";

describe("когда предоценку нужно пересчитать", () => {
  it("меняется при смене суммы, срока, цели и финансов", () => {
    const base = precheckKey(defaultData);
    expect(precheckKey({ ...defaultData, amount: defaultData.amount + 50_000 })).not.toBe(base);
    expect(precheckKey({ ...defaultData, term: defaultData.term + 1 })).not.toBe(base);
    expect(precheckKey({ ...defaultData, goal: "Перекрыть кассовый разрыв" })).not.toBe(base);
    expect(precheckKey({ ...defaultData, monthlyRevenue: 123_000 })).not.toBe(base);
    expect(precheckKey({ ...defaultData, hadOverdue2y: !defaultData.hadOverdue2y })).not.toBe(base);
  });
  it("не меняется от полей, которые на оценку не влияют", () => {
    expect(precheckKey({ ...defaultData, intentText: "другая фраза", consent1: true })).toBe(precheckKey(defaultData));
  });
});
