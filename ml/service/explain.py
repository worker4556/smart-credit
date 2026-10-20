"""Тексты для клиента: шаблоны из справочника причин + опциональный пересказ локальной LLM.

LLM получает только готовый шаблонный текст (коды и числа уже подставлены правилами) и может лишь
переформулировать его. Проверка: в ответе нет чисел, которых нет в шаблоне, нет кодов причин и запрещённых
формулировок; иначе показываем шаблон. Тексты по 115-ФЗ — только шаблон, LLM не вызывается.
"""
from __future__ import annotations

import re

from pydantic import BaseModel

from . import llm
from .config import Policy
from .route import Route
from .schemas import Cost, Decision, Precheck


class Explanation(BaseModel):
    text: str
    template_text: str
    source: str  # TEMPLATE | LLM
    fallback_reason: str | None = None


def rub(x: int | float) -> str:
    return f"{int(round(x)):,} ₽".replace(",", " ")


def _cost_line(c: Cost) -> str:
    if c.product == "OVERDRAFT":
        return (f"При полном использовании лимита проценты — {rub(c.monthly_payment)} в месяц, "
                f"плата за установку лимита — {rub(c.fee)}.")
    return f"Платёж — {rub(c.monthly_payment)} в месяц, полная стоимость в рублях — {rub(c.full_cost)}."


def _steps_line(policy: Policy, codes: list[str]) -> str:
    actions = [policy.reason(c).get("step", {}).get("action") for c in codes]
    actions = [a for a in actions if a]
    return " ".join(f"{i}) {a}." for i, a in enumerate(actions, 1))


# ---------- шаблоны ----------

def decision_template(policy: Policy, d: Decision) -> str:
    codes = [r.code for r in d.reasons]
    first = d.reasons[0].text.lower() if d.reasons else ""
    if d.outcome == "SUSPENDED_115FZ":
        return policy.reason("Z_115")["text"] + " Маршрут к одобрению в этом случае не строится."
    if d.outcome == "APPROVED":
        return f"Заявка одобрена: {rub(d.amount)} на {d.term_months} мес. " + _cost_line(d.cost)
    if d.outcome == "COUNTER_OFFER":
        if d.amount == d.requested_amount and d.cost:
            base = policy.products[d.cost.product]["rate"]
            why = "оценка ниже порога одобрения" if d.cost.rate > base else first
            return (f"Банк готов выдать всю сумму {rub(d.amount)} на {d.term_months} мес., но на других условиях: "
                    f"ставка {d.cost.rate:g}% вместо {base:g}%. " + _cost_line(d.cost)
                    + (f" Почему: {why}." if why else ""))
        return (f"Вы хотели {rub(d.requested_amount)} — банк может предложить {rub(d.amount)} на {d.term_months} мес. "
                + _cost_line(d.cost) + (f" Почему не вся сумма: {first}." if first else ""))
    if d.outcome == "INFO_REQUESTED":
        return f"Чтобы продолжить, нужно уточнить данные: {first}. Что сделать: {_steps_line(policy, codes[:1])}"
    stops = [r for r in d.reasons if r.kind == "STOP"]
    main = stops[0].text.lower() if stops else first
    tail = f" Что ещё снижает оценку: {', '.join(r.text.lower() for r in d.reasons if r.kind != 'STOP')}." \
        if len(d.reasons) > len(stops) else ""
    return f"Сейчас банк не может выдать кредит на эту сумму. Главная причина: {main}.{tail} Маршрут покажет, что можно сделать."


def precheck_template(policy: Policy, p: Precheck) -> str:
    chance = {"HIGH": "высокие", "MEDIUM": "средние", "LOW": "низкие"}[p.chance]
    head = (f"Шансы на {rub(p.requested_amount)} — {chance}. "
            + (f"Сейчас доступно примерно {rub(p.amount_range.low)} – {rub(p.amount_range.high)}. "
               if p.amount_range.high else "Сейчас доступной суммы нет. "))
    reasons = ", ".join(r.text.lower() for r in p.reasons[:3])
    return head + (f"Что тянет вниз: {reasons}. " if reasons else "") + p.disclaimer


def route_template(policy: Policy, r: Route) -> str:
    if r.status == "NO_ROUTE":
        return r.message
    lines = [f"До вершины в {rub(r.target_amount)}: {r.message[0].lower()}{r.message[1:]}"]
    for i, s in enumerate(r.steps, 1):
        gain = f" (+{s.points_gain} к оценке)" if s.points_gain else ""
        target = f" — до {rub(s.target_turnover)} в месяц" if s.target_turnover else ""
        lines.append(f"{i}) {s.action}{target}; срок: {s.term}{gain}.")
    lines.append(f"Ориентир: {r.horizon_text}. {r.disclaimer}")
    lines += r.advice
    return " ".join(lines)


# ---------- проверка ответа LLM ----------

FORBIDDEN = ("гарант", "обязательно получите", "точно одобр", "100%", "пск", "115")
CODE_RE = re.compile(r"\b[A-Z]{1,2}_[A-Z0-9_]+\b")


def _numbers(text: str) -> set[str]:
    joined = re.sub(r"(?<=\d)[  ](?=\d{3}\b)", "", text)
    return set(re.findall(r"\d+(?:[.,]\d+)?", joined))


def _allowed_numbers(template: str) -> set[str]:
    out = set()
    for n in _numbers(template):
        out.add(n)
        if n.isdigit() and int(n) >= 1000 and int(n) % 1000 == 0:
            out.add(str(int(n) // 1000))  # «850 000 ₽» можно сказать как «850 тыс. ₽»
    return out


def check_llm_text(text: str, template: str, outcome: str | None) -> str | None:
    """None — текст прошёл проверку, иначе — причина отказа."""
    if CODE_RE.search(text):
        return "в тексте код причины"
    extra = _numbers(text) - _allowed_numbers(template)
    if extra:
        return f"числа, которых нет на входе: {sorted(extra)}"
    low = text.lower()
    if any(w in low for w in FORBIDDEN):
        return "запрещённая формулировка"
    if "одобр" in low and outcome != "APPROVED":
        return "слово «одобрено» вне решения об одобрении"
    if len(text) > 2 * len(template) + 200:
        return "слишком длинно"
    return None


SYSTEM = (
    "Ты помогаешь предпринимателю понять ответ банка. Перескажи текст простым спокойным языком, 2–4 предложения, "
    "обращаясь на «вы». Сохрани все суммы и сроки ровно как в тексте. Не добавляй новых причин, чисел, обещаний "
    "и советов. Не пиши, что кредит одобрят. Ответь только пересказом."
)


def render(template: str, outcome: str | None, use_llm: bool, noncredit: bool = False) -> Explanation:
    if noncredit or not use_llm or not llm.enabled():
        return Explanation(text=template, template_text=template, source="TEMPLATE")
    out = llm.chat(SYSTEM, template, temperature=0.2, timeout=llm.TEXT_TIMEOUT)
    if not isinstance(out, str):
        return Explanation(text=template, template_text=template, source="TEMPLATE", fallback_reason="LLM недоступна")
    problem = check_llm_text(out, template, outcome)
    if problem:
        return Explanation(text=template, template_text=template, source="TEMPLATE", fallback_reason=problem)
    return Explanation(text=out, template_text=template, source="LLM")


def explain_decision(policy: Policy, d: Decision, use_llm: bool = True) -> Explanation:
    return render(decision_template(policy, d), d.outcome, use_llm, noncredit=d.outcome == "SUSPENDED_115FZ")


def explain_precheck(policy: Policy, p: Precheck, use_llm: bool = True) -> Explanation:
    return render(precheck_template(policy, p), None, use_llm)


def explain_route(policy: Policy, r: Route, use_llm: bool = True) -> Explanation:
    return render(route_template(policy, r), None, use_llm, noncredit=r.holds == "NONCREDIT")
