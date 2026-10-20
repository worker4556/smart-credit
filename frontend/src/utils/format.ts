export const formatNumber = (value: number) =>
  Math.round(value)
    .toLocaleString("ru-RU")
    .replace(/\u00a0/g, " ");
export const formatMoney = (value: number) => `${formatNumber(value)} ₽`;

import { defaultData as defaultApplication } from "../data/application";
import type { ApplicationData } from "../types";

export function loadApplication(): ApplicationData {
  return defaultApplication;
}
