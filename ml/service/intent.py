"""Шаг 1. Задача клиента одной фразой → цель, сумма, срок и продукт.

Два слоя: правила (работают всегда) и локальная LLM (если включена). LLM выбирает цель и разрешает
неоднозначности, но сумму и срок может взять только из чисел, которые правила нашли в самой фразе, —
выдуманная сумма отбрасывается. Клиент всегда подтверждает поля; если что-то не найдено — форма.
"""
from __future__ import annotations

import math
import re
from typing import Literal

from pydantic import BaseModel

from . import llm

Purpose = Literal["PURCHASE", "CASH_GAP", "CONTRACT", "EQUIPMENT", "EXPANSION", "OTHER"]

PURPOSE_TEXT = {
    "PURCHASE": "Закупка товара, сырья или материалов",
    "CASH_GAP": "Кассовый разрыв",
    "CONTRACT": "Исполнение контракта",
    "EQUIPMENT": "Покупка оборудования",
    "EXPANSION": "Развитие и расширение бизнеса",
    "OTHER": "Другое",
}

KEYWORDS: dict[str, tuple[str, ...]] = {
    "CASH_GAP": ("кассов", "разрыв", "зарплат", "аренд", "налог", "запас на", "подушк", "не заплатил", "не платят",
                 "задерж", "отсрочк", "до поступлен", "пока не придут", "пока покупатели", "перекрыть", "пережить",
                 "дебиторк", "покрыть расход", "на текущие расход", "перечисл", "спад"),
    "PURCHASE": ("закуп", "товар", "сырь", "материал", "запчаст", "расходник", "сезон", "партию", "партия",
                 "ассортимент", "склад", "продукци", "ткан", "кофе в зерн", "краск", "корм"),
    "CONTRACT": ("контракт", "госзаказ", "тендер", "по договору", "исполнить договор", "заказ от", "крупный заказ",
                 "исполнить заказ"),
    "EQUIPMENT": ("оборудован", "станок", "станка", "кофемашин", "печь", "печи", "холодильн", "автомобил",
                  "грузовик", "фургон", "техник", "кресл", "принтер", "компьютер"),
    "EXPANSION": ("открыть", "открыти", "точк", "расшир", "филиал", "второй зал", "ремонт помещ", "новое направлен",
                  "магазин ещё", "ещё один", "развити"),
}
PRIORITY = ["CASH_GAP", "CONTRACT", "EQUIPMENT", "PURCHASE", "EXPANSION"]

HUNDREDS = {"сто": 100, "двести": 200, "триста": 300, "четыреста": 400, "пятьсот": 500, "шестьсот": 600,
            "семьсот": 700, "восемьсот": 800, "девятьсот": 900}
TENS = {"двадцать": 20, "тридцать": 30, "сорок": 40, "пятьдесят": 50, "шестьдесят": 60, "семьдесят": 70,
        "восемьдесят": 80, "девяносто": 90}
SMALL = {"один": 1, "одну": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6, "семь": 7,
         "восемь": 8, "девять": 9, "десять": 10, "одиннадцать": 11, "двенадцать": 12, "пятнадцать": 15,
         "восемнадцать": 18, "пару": 2, "пара": 2, "полтора": 1.5, "полторы": 1.5}

NUM = r"\d+(?:[.,]\d+)?"
WORDNUM = "|".join(sorted([*HUNDREDS, *TENS, *SMALL], key=len, reverse=True))


class Intent(BaseModel):
    purpose: Purpose | None
    purpose_text: str | None
    amount: int | None
    term_months: int | None
    product: Literal["WORKING_CAPITAL", "OVERDRAFT"] | None
    product_reason: str | None
    missing: list[str]
    needs_confirmation: bool = True
    source: Literal["RULES", "LLM"]


def _num(s: str) -> float:
    return float(s.replace(",", ".").replace(" ", ""))


def _words_value(text: str) -> float | None:
    total, found = 0.0, False
    for w in text.split():
        for table in (HUNDREDS, TENS, SMALL):
            if w in table:
                total += table[w]
                found = True
    return total if found else None


def amount_candidates(text: str) -> list[tuple[int, int]]:
    """Все суммы во фразе: [(позиция, рубли)]."""
    t = text.lower().replace(" ", " ")
    out: list[tuple[int, int]] = []
    taken: list[tuple[int, int]] = []

    def add(m: re.Match, value: float) -> None:
        if any(a <= m.start() < b for a, b in taken):
            return
        taken.append(m.span())
        out.append((m.start(), int(round(value))))

    for m in re.finditer(r"полмиллиона|пол миллиона|полмиллион", t):
        add(m, 500_000)
    for m in re.finditer(rf"(?:({NUM})|((?:{WORDNUM})(?:\s+(?:{WORDNUM}))*))?\s*(млн|миллион\w*|лям\w*)", t):
        base = _num(m.group(1)) if m.group(1) else (_words_value(m.group(2)) if m.group(2) else 1)
        add(m, base * 1_000_000)
    for m in re.finditer(rf"(?:({NUM})|((?:{WORDNUM})(?:\s+(?:{WORDNUM}))*))\s*(тыс\w*|тр\b|т\.р\.?|к\b|k\b|косар\w*)", t):
        base = _num(m.group(1)) if m.group(1) else _words_value(m.group(2))
        if base:
            add(m, base * 1_000)
    for m in re.finditer(r"\d{1,3}(?:[ .]\d{3})+|\d{4,}", t):
        value = _num(m.group(0).replace(".", "").replace(" ", ""))
        tail = t[m.end():m.end() + 8]
        if value >= 10_000 and not re.match(r"\s*(мес|год|лет|дн|недел|г\b)", tail):
            add(m, value)
    return sorted(out)


def term_candidates(text: str) -> list[int]:
    t = text.lower()
    out: list[int] = []
    for m in re.finditer(rf"(?:на|за|в течение|срок(?:ом)?|до)?\s*({NUM}|{WORDNUM})?\s*(месяц\w*|мес\b|мес\.)", t):
        if m.group(1) is None:
            if re.search(r"\b(на|за|в течение)\s+месяц", m.group(0)):
                out.append(1)
            continue
        v = _num(m.group(1)) if re.match(NUM, m.group(1)) else SMALL.get(m.group(1)) or TENS.get(m.group(1))
        if v:
            out.append(int(v))
    for m in re.finditer(rf"({NUM}|{WORDNUM})?\s*(год\b|года\b|лет\b|годик\w*)", t):
        g = m.group(1)
        if g is None:
            if re.search(r"\b(на|за)\s+год", t[max(0, m.start() - 4):m.end()]):
                out.append(12)
            continue
        v = _num(g) if re.match(NUM, g) else SMALL.get(g)
        if v:
            out.append(int(round(v * 12)))
    if "полгода" in t or "пол года" in t:
        out.append(6)
    if "полтора года" in t:
        out.append(18)
    for m in re.finditer(rf"({NUM}|{WORDNUM})?\s*недел\w*", t):
        v = (_num(m.group(1)) if m.group(1) and re.match(NUM, m.group(1)) else SMALL.get(m.group(1) or "", 1))
        out.append(max(1, math.ceil(v / 4)))
    return out


def _pick_amount(text: str, cands: list[tuple[int, int]]) -> int | None:
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0][1]
    t = text.lower()
    # Числа рядом со словами «выручка/оборот/стоит» — не сумма кредита
    own = [(p, v) for p, v in cands if not re.search(r"выручк|оборот|стоит|цена|доход", t[max(0, p - 25):p])] or cands
    for pos, value in own:  # сумма сразу после «нужно/хочу/взять/кредит»
        if re.search(r"(нуж\w*|надо|хочу|взять|кредит\w*|займ\w*|на сумму|не хватает)\s*$", t[max(0, pos - 20):pos]):
            return value
    return own[0][1]


def purpose_by_rules(text: str) -> Purpose | None:
    t = text.lower()
    hits = {p: sum(k in t for k in kw) for p, kw in KEYWORDS.items()}
    best = max(hits.values())
    if best == 0:
        return None
    return next(p for p in PRIORITY if hits[p] == best)


def suggest_product(purpose: str | None, term: int | None) -> tuple[str | None, str | None]:
    """Кассовый разрыв до 2 мес. → овердрафт; закупка и запас на срок от 6 мес. → оборотный кредит [допущение]."""
    if purpose is None:
        return None, None
    if purpose == "CASH_GAP" and (term is None or term <= 2):
        return "OVERDRAFT", "Кассовый разрыв на короткий срок закрывает овердрафт: деньги доступны прямо на счёте, гасится поступлениями."
    if purpose == "EQUIPMENT":
        return "WORKING_CAPITAL", "Кредит на оборудование скоро появится; сейчас подойдёт оборотный кредит."
    return "WORKING_CAPITAL", "Оборотный кредит: вся сумма сразу, равные платежи на срок от 6 месяцев."


LLM_SYSTEM = (
    "Ты разбираешь фразу предпринимателя о том, зачем ему деньги. Верни JSON с полями: "
    "purpose — одно из PURCHASE (закупка товара, сырья, материалов, запчастей, к сезону), "
    "CASH_GAP (кассовый разрыв, зарплата, аренда, налоги, запас денег на месяц, ждут оплату от покупателей), "
    "CONTRACT (исполнить контракт или крупный заказ), EQUIPMENT (оборудование, транспорт, техника), "
    "EXPANSION (открыть точку, расшириться, ремонт), OTHER; "
    "amount_rub — сумма, которую человек хочет получить, в рублях целым числом, или null; "
    "term_months — срок в месяцах целым числом, или null, если срок не назван. "
    "Не путай сумму кредита с выручкой или ценой. Ничего не придумывай: если в фразе нет числа — null."
)
LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "purpose": {"type": "string", "enum": ["PURCHASE", "CASH_GAP", "CONTRACT", "EQUIPMENT", "EXPANSION", "OTHER"]},
        "amount_rub": {"type": ["integer", "null"]},
        "term_months": {"type": ["integer", "null"]},
    },
    "required": ["purpose", "amount_rub", "term_months"],
}


def parse(text: str, use_llm: bool = True) -> Intent:
    cands = amount_candidates(text)
    terms = term_candidates(text)
    purpose, amount, term = purpose_by_rules(text), _pick_amount(text, cands), (terms[0] if terms else None)
    source = "RULES"

    out = llm.chat(LLM_SYSTEM, text, schema=LLM_SCHEMA) if use_llm else None
    if isinstance(out, dict):
        source = "LLM"
        if out.get("purpose") in PURPOSE_TEXT and (out["purpose"] != "OTHER" or purpose is None):
            purpose = out["purpose"]
        # Сумма и срок — только из чисел, реально найденных во фразе
        if out.get("amount_rub") in {v for _, v in cands}:
            amount = out["amount_rub"]
        if out.get("term_months") in terms:
            term = out["term_months"]

    product, why = suggest_product(purpose, term)
    missing = [name for name, v in (("purpose", purpose), ("amount", amount), ("term_months", term)) if v is None]
    if product == "OVERDRAFT" and "term_months" in missing:
        missing.remove("term_months")  # у овердрафта срок фиксирован
    return Intent(purpose=purpose, purpose_text=PURPOSE_TEXT.get(purpose) if purpose else None, amount=amount,
                  term_months=term, product=product, product_reason=why, missing=missing, source=source)
