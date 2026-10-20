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
  ["Погасить другие кредиты", "Свести платежи в один", "merge"],
  ["Пока не знаю, подскажите", "Задам один вопрос и помогу выбрать", "help"],
];

import type { ApplicationData } from "../types";

export const defaultData: ApplicationData = {
  goal: goals[0][0],
  amount: 1_500_000,
  term: 12,
  inn: "7700000000",
  companyOk: true,
  revenue: "10–30 млн ₽",
  hasLoans: "Нет",
  loanPayment: 0,
  collateral: "Ничего",
  offer: 0,
  docs: {},
  consent1: true,
  consent2: true,
  submitted: false,
  outcome: "review",
};
