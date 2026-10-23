import { describe, expect, it } from "vitest";
import { needsRoute, reasonTone } from "./route";
import { formatMoney } from "./format";
import type { Precheck } from "../types";

const precheck = (chance: string, amountHigh: number): Precheck =>
  ({ chance, amountHigh, amountLow: amountHigh, reasons: [], text: "", goalOffers: [] });

describe("цвет причины", () => {
  it("стоп-фактор и 115-ФЗ — красные", () => {
    expect(reasonTone("S_TAX")).toBe("red");
    expect(reasonTone("Z_115")).toBe("red");
  });
  it("данные и сумма — можно сразу", () => {
    expect(reasonTone("D_MISMATCH")).toBe("green");
    expect(reasonTone("B_AMOUNT")).toBe("green");
  });
  it("факторы — нужно время, а «ускорить нельзя» — красный", () => {
    expect(reasonTone("B_TURNOVER")).toBe("amber");
    expect(reasonTone("S_90_12", "~8 мес., ускорить нельзя")).toBe("red");
  });
});

describe("когда нужен маршрут", () => {
  it("высокий шанс и сумма в пределах оценки — маршрут не нужен", () => {
    expect(needsRoute(precheck("HIGH", 1_000_000), 850_000)).toBe(false);
  });
  it("шанс ниже высокого или сумма выше оценки — нужен", () => {
    expect(needsRoute(precheck("MEDIUM", 1_000_000), 850_000)).toBe(true);
    expect(needsRoute(precheck("HIGH", 500_000), 850_000)).toBe(true);
  });
  it("без предоценки маршрута нет", () => {
    expect(needsRoute(undefined, 850_000)).toBe(false);
  });
});

describe("деньги", () => {
  it("рубли с пробелами между разрядами", () => {
    expect(formatMoney(1_234_567)).toBe("1 234 567 ₽");
  });
});
