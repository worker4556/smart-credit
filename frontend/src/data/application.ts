export const goals = [
  [
    "Закрыть текущие расходы",
    "Зарплаты, аренда, налоги, поставщики",
    "receipt",
  ],
  ["Закупить товар или материалы", "Чтобы продавать или производить", "store"],
  [
    "Перекрыть кассовый разрыв",
    "Клиенты задерживают оплату, а платить надо сейчас",
    "bolt",
  ],
  [
    "Купить оборудование или технику",
    "Станок, транспорт, кассы и т. п.",
    "tool",
  ],
  ["Открыть точку или расширить бизнес", "Новая точка, ремонт, новое направление", "expand"],
  ["Погасить другие кредиты", "Свести платежи в один", "merge"],
  ["Другое", "Опишите другую задачу бизнеса", "help"],
];

import type { ApplicationData } from "../types";

export const defaultData: ApplicationData = {
  goal: goals[0][0],
  amount: 1_500_000,
  term: 12,
  inn: "",
  companyOk: false,
  monthlyRevenue: 0,
  hasLoans: "Нет",
  loanPayment: 0,
  hadOverdue2y: false,
  collateral: "Ничего",
  offer: 0,
  docs: {},
  consent1: true,
  consent2: true,
  submitted: false,
  outcome: "review",
  activity: [],
};
