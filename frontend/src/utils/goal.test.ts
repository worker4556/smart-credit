import { describe, expect, it } from "vitest";
import { goalInSentence, isOverdraftGoal, productName, tokenize } from "./goal";

describe("продукт по цели", () => {
  it("кассовый разрыв — овердрафт, остальное — оборотный кредит", () => {
    expect(isOverdraftGoal("Перекрыть кассовый разрыв")).toBe(true);
    expect(productName("Перекрыть кассовый разрыв")).toBe("Овердрафт");
    expect(productName("Закупить товар или материалы")).toBe("Оборотный кредит");
  });
  it("цель читается внутри фразы с маленькой буквы", () => {
    expect(goalInSentence("Закупить товар или материалы")).toBe("закупить товар");
    expect(goalInSentence("Перекрыть кассовый разрыв")).toBe("перекрыть кассовый разрыв");
  });
});

describe("подсветка слов фразы", () => {
  it("находит сумму, срок и цель", () => {
    const kinds = tokenize("Нужно 850 тысяч на 2 года на закупку к сезону").map((t) => t.kind);
    expect(kinds).toEqual([null, "amount", "amount", null, "term", "term", null, "goal", null, "goal"]);
  });
  it("пустая фраза — нет слов", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});
