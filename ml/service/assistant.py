"""Помощник при отказе и нехватке: отвечает на вопросы клиента строго по фактам его решения и маршрута.

Шаблонный ответ считается всегда и первым; LLM только переформулирует факты, её ответ проходит ту же проверку, что
и пересказ решения (нет новых чисел, кодов, обещаний, «одобрено»), иначе показывается шаблон. 115-ФЗ — без LLM.
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from . import llm
from .config import Policy
from .explain import check_llm_text, rub
from .glossary import find_terms
from .route import Route
from .schemas import Decision

Topic = Literal["WHY", "WHAT_TO_DO", "WHEN", "TERM", "AMOUNT", "OFF_TOPIC", "NONCREDIT", "NOT_NEEDED"]

OUTCOME_TEXT = {"APPROVED": "одобрено", "COUNTER_OFFER": "иные условия", "INFO_REQUESTED": "нужны данные",
                "REJECTED": "отказ", "SUSPENDED_115FZ": "приостановлена по 115-ФЗ"}

PATTERNS: list[tuple[Topic, str]] = [
    ("TERM", r"что\s+(такое|значит|означает)|что\s+это|объясни"),
    ("WHEN", r"когда|через\s+сколько|как\s+скоро|сколько\s+ждать|снова|повторно"),
    ("WHAT_TO_DO", r"что\s+(мне\s+)?(делать|сделать)|как\s+(повысить|улучшить|получить|исправить)|что\s+нужно|"
                   r"как(ую|ие|ой)\s+(выписк|документ)|загрузить"),
    ("AMOUNT", r"меньше|сумм|не\s+вс[юе]|млн|тыс|₽|лимит"),
    ("WHY", r"почему|причин|из-за\s+чего|за\s+что|отказ"),
]


class AssistantAnswer(BaseModel):
    answer: str
    template_answer: str
    source: Literal["LLM", "TEMPLATE"]
    fallback_reason: str | None = None
    topic: Topic
    terms: list[str] = []


def classify(question: str, terms: list[dict]) -> Topic:
    q = question.lower()
    for topic, pattern in PATTERNS:
        if re.search(pattern, q):
            return "WHY" if topic == "TERM" and not terms else topic   # «что это значит?» — про само решение
    return "TERM" if terms else "OFF_TOPIC"


def facts(policy: Policy, decision: Decision | None, route: Route | None) -> list[str]:
    """Всё, что помощнику разрешено знать: тексты причин, условия решения, шаги маршрута."""
    out: list[str] = []
    if decision:
        out.append(f"Решение: {OUTCOME_TEXT[decision.outcome]}.")
        out.append(f"Запрошено: {rub(decision.requested_amount)}.")
        if decision.amount and decision.cost:
            c = decision.cost
            out.append(f"Банк может предложить: {rub(decision.amount)} на {decision.term_months} мес., ставка {c.rate:g}%, "
                       f"платёж {rub(c.monthly_payment)} в месяц, полная стоимость в рублях {rub(c.full_cost)}.")
        for r in decision.reasons:
            out.append(f"Причина: {r.text}.")
            step = policy.reason(r.code).get("step", {})
            if step.get("action") and step.get("effect") != "alternative":
                out.append(f"Что можно сделать: {step['action']} (срок: {step['term']}).")
    if route and route.status != "NO_ROUTE":
        for i, s in enumerate(route.steps, 1):
            gain = f", +{s.points_gain} к оценке" if s.points_gain else ""
            out.append(f"Шаг маршрута {i}: {s.action}; срок: {s.term}{gain}.")
        out.append(f"Ориентир: {route.horizon_text}. {route.disclaimer}")
        out += route.advice
    return out


def _lines(prefix: str, items: list[str]) -> str:
    return prefix + " ".join(items) if items else ""


def template(policy: Policy, topic: Topic, question: str, decision: Decision | None, route: Route | None,
             terms: list[dict]) -> str:
    a = policy.raw["assistant"]
    if topic == "OFF_TOPIC":
        return a["off_topic"]
    if topic == "TERM":
        return " ".join(f"{t['term']}: {t['plain']}. {t['more']}" for t in terms[:2])
    reasons = decision.reasons if decision else []
    stops = [r for r in reasons if r.kind == "STOP"]
    if topic == "WHEN":
        body = (f"Ориентир — {route.horizon_text}. {route.disclaimer}" + (" " + " ".join(route.advice) if route.advice else "")
                if route and route.status != "NO_ROUTE" else a["no_route_yet"])
    elif topic == "WHAT_TO_DO":
        if route and route.status != "NO_ROUTE" and route.steps:
            body = " ".join(f"{i}) {s.action} — срок: {s.term}." for i, s in enumerate(route.steps, 1))
            body += f" Ориентир — {route.horizon_text}. {route.disclaimer}"
        else:
            actions = [policy.reason(r.code).get("step", {}).get("action") for r in reasons]
            body = " ".join(f"{i}) {x}." for i, x in enumerate([x for x in actions if x], 1)) or a["no_route_yet"]
    elif topic == "AMOUNT" and decision and decision.amount and decision.outcome == "COUNTER_OFFER":
        first = next((r.text for r in reasons), "")
        body = (f"Вы хотели {rub(decision.requested_amount)} — банк может предложить {rub(decision.amount)} "
                f"на {decision.term_months} мес." + (f" Почему не вся сумма: {first}." if first else ""))
    else:
        main = (stops or reasons)
        body = f"Главная причина: {main[0].text}." if main else "Причины указаны на экране решения."
        rest = [r.text for r in reasons if r not in main[:1]]
        if rest:
            body += " Что ещё влияет: " + "; ".join(rest) + "."
    return f"{body} {a['tail']}"


SYSTEM = (
    "Ты помогаешь предпринимателю понять решение банка по его заявке. Отвечай на вопрос 2–4 предложениями, на «вы», "
    "простыми словами и только по фактам ниже. Не добавляй новых чисел, причин, сроков и советов. Не обещай одобрение "
    "и не пиши слово «одобрено». Если вопрос не про заявку или банковские термины — вежливо верни к заявке."
)


def answer(policy: Policy, question: str, decision: Decision | None, route: Route | None,
           use_llm: bool = True) -> AssistantAnswer:
    a = policy.raw["assistant"]
    noncredit = (decision and decision.outcome == "SUSPENDED_115FZ") or (route and route.holds == "NONCREDIT")
    if noncredit:
        text = f"{policy.reason('Z_115')['text']} {a['noncredit_extra']}"
        return AssistantAnswer(answer=text, template_answer=text, source="TEMPLATE", topic="NONCREDIT")
    if decision and decision.outcome == "APPROVED" and not route:
        return AssistantAnswer(answer=a["not_needed"], template_answer=a["not_needed"], source="TEMPLATE",
                               topic="NOT_NEEDED")

    terms = find_terms(policy, question)
    topic = classify(question, terms)
    tmpl = template(policy, topic, question, decision, route, terms)
    result = AssistantAnswer(answer=tmpl, template_answer=tmpl, source="TEMPLATE", topic=topic,
                             terms=[t["term"] for t in terms])
    if not use_llm or topic == "OFF_TOPIC":
        return result
    known = facts(policy, decision, route) + [f"{t['term']}: {t['plain']}. {t['more']}" for t in terms]
    out = llm.chat(SYSTEM, "Факты:\n- " + "\n- ".join(known) + f"\n\nВопрос клиента: {question}",
                   temperature=0.2, timeout=llm.TEXT_TIMEOUT) if llm.ready() else None
    if not isinstance(out, str):
        return result.model_copy(update={"fallback_reason": "LLM недоступна"})
    problem = check_llm_text(out, tmpl + " " + " ".join(known), decision.outcome if decision else None)
    if problem:
        return result.model_copy(update={"fallback_reason": problem})
    return result.model_copy(update={"answer": out, "source": "LLM"})
