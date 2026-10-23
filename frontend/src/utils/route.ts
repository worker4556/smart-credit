import type { Precheck } from "../types";

export type Tone = "green" | "amber" | "red";

// Цвет по виду причины из ml/config/reasons.yaml:
// DATA и смена суммы/срока — можно сразу; FACTOR/LIMIT/PRICE — нужно время; STOP/NONCREDIT — стоп-фактор.
export function reasonTone(code?: string, term?: string): Tone {
  if (term && /ускорить нельзя|нельзя ускорить/i.test(term)) return "red";
  if (!code) return "amber";
  if (code.startsWith("S_") || code.startsWith("Z_")) return "red";
  if (code.startsWith("D_") || code === "B_AMOUNT") return "green";
  return "amber";
}

export const toneLabel: Record<Tone, string> = {
  green: "Можно сразу",
  amber: "Нужно время",
  red: "Стоп-фактор",
};

export const chanceLabel: Record<string, string> = { HIGH: "Высокий", MEDIUM: "Средний", LOW: "Низкий" };
export const chanceTone: Record<string, Tone> = { HIGH: "green", MEDIUM: "amber", LOW: "red" };

// Маршрут нужен только там, где есть неопределённость: шанс ниже высокого или сумма выше оценки.
export function needsRoute(precheck: Precheck | undefined, amount: number): boolean {
  if (!precheck) return false;
  return precheck.chance !== "HIGH" || amount > precheck.amountHigh;
}
