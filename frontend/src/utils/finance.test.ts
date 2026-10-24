import { describe, expect, it } from "vitest";
import { debtPoints, debtTone, paymentTone, percent, share } from "./finance";

describe("финансы глазами движка", () => {
  it("баллы долговой нагрузки по порогам политики", () => {
    expect(debtPoints(0)).toBe(15);
    expect(debtPoints(0.05)).toBe(15);
    expect(debtPoints(0.08)).toBe(12);
    expect(debtPoints(0.15)).toBe(8);
    expect(debtPoints(0.25)).toBe(4);
    expect(debtPoints(0.4)).toBe(0);
  });
  it("цвет нагрузки и платежа", () => {
    expect(debtTone(0.02)).toBe("green");
    expect(debtTone(0.15)).toBe("amber");
    expect(paymentTone(0.1)).toBe("green");
    expect(paymentTone(0.19)).toBe("amber");
    expect(paymentTone(0.25)).toBe("red");
  });
  it("без оборота долю не считаем", () => {
    expect(share(20000, 0)).toBeNull();
    expect(share(20000, 950000)).toBeCloseTo(0.021, 3);
    expect(percent(0.021)).toBe("2,1%");
  });
});
