// Шаг 1 «Задача»: продукт по цели и разбор фразы на слова для визуализации
export type TokenKind = "amount" | "term" | "goal" | null;

export const isOverdraftGoal = (goal: string) => goal.includes("кассов");

export const productName = (goal: string) => (isOverdraftGoal(goal) ? "Овердрафт" : "Оборотный кредит");

export const productReason = (goal: string) =>
  isOverdraftGoal(goal)
    ? "Для кассового разрыва — овердрафт: проценты только за использованный остаток, срок 12 мес."
    : "Оборотный кредит: сумма сразу, равные платежи каждый месяц.";

// Цель внутри фразы «Нужно … на …, чтобы …»: короткая форма, остальное — с маленькой буквы
const shortGoals: Record<string, string> = {
  "Закупить товар или материалы": "закупить товар",
  "Купить оборудование или технику": "купить оборудование",
  "Открыть точку или расширить бизнес": "расширить бизнес",
  "Другое": "решить другую задачу",
};
export const goalInSentence = (goal: string) => shortGoals[goal] ?? goal.charAt(0).toLocaleLowerCase("ru") + goal.slice(1);

const AMOUNT_UNIT = /^(тыс|тысяч|млн|миллион|руб|₽|т\.?р)/i;
const TERM_UNIT = /^(мес|год|лет|г\.)/i;
const NUMBER = /^\d[\d\s.,]*$|^(один|два|две|три|пять|десять|полтора|полгода|полмиллиона)/i;
const GOAL_WORD = /^(закуп|товар|сезон|оборуд|техник|зарплат|аренд|налог|разрыв|касс|расшир|точк|ремонт|погас|кредит|сырь|материал|станок|транспорт)/i;

// Слова фразы и какое поле они, скорее всего, задают — только для подсветки, разбор делает сервер
export function tokenize(text: string): Array<{ word: string; kind: TokenKind }> {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 16);
  return words.map((word, i) => {
    const clean = word.replace(/[,.!?;:]+$/, "");
    const next = (words[i + 1] ?? "").replace(/[,.!?;:]+$/, "");
    if (AMOUNT_UNIT.test(clean) && i > 0 && NUMBER.test(words[i - 1])) return { word, kind: "amount" };
    if (TERM_UNIT.test(clean)) return { word, kind: "term" };
    if (NUMBER.test(clean)) return { word, kind: TERM_UNIT.test(next) ? "term" : "amount" };
    if (GOAL_WORD.test(clean)) return { word, kind: "goal" };
    return { word, kind: null };
  });
}
