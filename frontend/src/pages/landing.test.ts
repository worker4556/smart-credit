import { describe, expect, it } from "vitest";
import { seasonForDate, trailPlan, type Metrics } from "./LandingPage";
import type { RouteStep } from "../types";

const step = (code: string, done = false): RouteStep => ({ code, action: code, term: "недели", done });
const metrics = (over: Partial<NonNullable<Metrics>>) =>
  ({ summit: 1_200_000, height: 0, steps: [], projected: null, holds: undefined, ...over }) as NonNullable<Metrics>;

describe("альпинист на тропе", () => {
  it("без маршрута стоит на доле доступной суммы", () => {
    expect(trailPlan(metrics({ height: 600_000 })).climber).toBeCloseTo(0.5);
  });
  it("каждый выполненный шаг поднимает к следующему привалу", () => {
    const steps = [step("S_TAX"), step("O_DEBT"), step("B_TURNOVER")];
    const none = trailPlan(metrics({ steps, projected: 1_100_000 }));
    const two = trailPlan(metrics({ steps: [step("S_TAX", true), step("O_DEBT", true), step("B_TURNOVER")], projected: 1_100_000 }));
    expect(none.climber).toBe(0);
    expect(two.done).toBe(2);
    expect(two.climber).toBeGreaterThan(none.climber);
    expect(two.climber).toBeCloseTo(two.stops[1].t);
  });
  it("временное окно: стоит у подножия, отметки его не двигают", () => {
    const plan = trailPlan(metrics({ holds: "TIME_WINDOW", steps: [step("S_90_12"), step("B_COURTS", true)], projected: 450_000 }));
    expect(plan.still).toBe(true);
    expect(plan.climber).toBe(0);
  });
  it("одобрено на всю сумму — на вершине", () => {
    expect(trailPlan(metrics({ height: 1_200_000 })).climber).toBe(1);
  });
});

describe("время года", () => {
  it("по месяцу", () => {
    expect(seasonForDate(new Date(2026, 0, 15))).toBe("winter");
    expect(seasonForDate(new Date(2026, 3, 15))).toBe("spring");
    expect(seasonForDate(new Date(2026, 6, 15))).toBe("summer");
    expect(seasonForDate(new Date(2026, 9, 24))).toBe("autumn");
  });
});
