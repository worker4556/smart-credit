"""Помощник по заявке: отвечает на вопросы клиента строго по фактам его заявки — при отказе и нехватке
(решение и маршрут) и когда всё в порядке (стадия заявки, предоценка, условия одобрения).

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
from .schemas import Decision, Precheck

Topic = Literal["WHY", "WHAT_TO_DO", "WHEN", "TERM", "AMOUNT", "OFF_TOPIC", "NONCREDIT", "NOT_NEEDED"]

OUTCOME_TEXT = {"APPROVED": "одобрено", "COUNTER_OFFER": "иные условия", "INFO_REQUESTED": "нужны данные",
                "REJECTED": "отказ", "SUSPENDED_115FZ": "приостановлена по 115-ФЗ"}

PATTERNS: list[tuple[Topic, str]] = [
    ("TERM", r"что\s+(такое|значит|означает)|что\s+это|объясни"),
    ("WHEN", r"когда|через\s+сколько|как\s+скоро|сколько\s+ждать|снова|повторно|ускор"),
    ("WHAT_TO_DO", r"что\s+(мне\s+|нам\s+)?(теперь\s+|сейчас\s+|дальше\s+)?(делать|сделать)|как\s+быть|куда\s+нажать|как\s+(повысить|улучшить|получить|исправить)|что\s+нужно|"
                   r"как(ую|ие|ой)\s+(выписк|документ)|загрузить|что\s+будет|после\s+загрузк|дальше|следующ|"
                   r"как\s+(подписать|принять|отправить)"),
    ("AMOUNT", r"меньше|сумм|не\s+вс[юе]|млн|тыс|₽|лимит|стоит|стоимост|переплат|ставк|плат[её]ж"),
    ("WHY", r"почему|зачем|причин|из-за\s+чего|за\s+что|отказ"),
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


def facts(policy: Policy, decision: Decision | None, route: Route | None, topic: Topic | None = None) -> list[str]:
    """Всё, что помощнику разрешено знать: тексты причин, условия решения, шаги маршрута.
    Запрошенная сумма — только в вопросах о сумме: иначе модель может выдать её за предложение банка."""
    out: list[str] = []
    if decision:
        out.append(f"Решение: {OUTCOME_TEXT[decision.outcome]}.")
        if topic == "AMOUNT":
            out.append(f"Клиент хотел: {rub(decision.requested_amount)}.")
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
    elif (topic == "AMOUNT" and decision and decision.amount and decision.cost and decision.outcome == "COUNTER_OFFER"
          and decision.amount == decision.requested_amount):
        base = policy.products[decision.cost.product]["rate"]
        first = next((r.text for r in reasons), "")
        body = (f"Банк готов выдать всю сумму {rub(decision.amount)} на {decision.term_months} мес., но ставка "
                f"{decision.cost.rate:g}% вместо {base:g}%." + (f" Почему: {first}." if first else ""))
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


# ---------- Когда с заявкой всё в порядке ----------

GOOD_STAGES = {"DRAFT", "SUBMITTED", "IN_REVIEW", "SPECIALIST_REVIEW", "APPROVED", "OFFER_ACCEPTED", "SIGNED", "DISBURSED"}
CHANCE_TEXT = {"HIGH": "высокий", "MEDIUM": "средний", "LOW": "низкий"}


def _cost_text(cost) -> str:
    """Условия одной фразой; овердрафт — проценты при полном использовании плюс комиссия, без аннуитета."""
    if cost.product == "OVERDRAFT":
        return (f"лимит {rub(cost.amount)}, ставка {cost.rate:g}%, проценты при полном использовании — "
                f"{rub(cost.monthly_payment)} в месяц, комиссия за установку лимита {rub(cost.fee)}")
    return (f"{rub(cost.amount)} на {cost.term_months} мес., ставка {cost.rate:g}%, платёж {rub(cost.monthly_payment)} "
            f"в месяц, полная стоимость в рублях {rub(cost.full_cost)}")


def _precheck_facts(p: Precheck) -> list[str]:
    out = [f"Предварительный шанс — {CHANCE_TEXT[p.chance]}.",
           f"Сейчас доступно примерно {rub(p.amount_range.low)} — {rub(p.amount_range.high)}." if p.amount_range.high
           else "Сейчас доступной суммы нет.",
           f"Запрошено: {rub(p.requested_amount)}."]
    out += [f"Что влияет: {r.text}." for r in p.reasons]
    if p.owner_note:
        out.append(p.owner_note)
    out.append(p.disclaimer)
    return out


def good_template(policy: Policy, topic: Topic, stage: str | None, decision: Decision | None,
                  precheck: Precheck | None, terms: list[dict]) -> str:
    a = policy.raw["assistant"]
    st = a["stages"]
    fmt = {"valid_days": policy.raw["precheck"]["valid_days"], "offer_valid_days": a["offer_valid_days"]}
    if topic == "OFF_TOPIC":
        return a["off_topic_good"]
    if topic == "TERM":
        return " ".join(f"{t['term']}: {t['plain']}. {t['more']}" for t in terms[:2])

    if stage in {"SUBMITTED", "IN_REVIEW"}:
        return st["IN_REVIEW"]
    if stage == "SPECIALIST_REVIEW":
        return st["SPECIALIST_REVIEW"]

    if stage == "DRAFT" or (stage is None and precheck and not decision):
        if not precheck:
            return st["DRAFT_NO_PRECHECK"]
        chance = CHANCE_TEXT[precheck.chance]
        high = precheck.amount_range.high
        rng = (f"сейчас доступно примерно {rub(precheck.amount_range.low)} — {rub(high)}" if high
               else "доступной суммы сейчас нет")
        if topic == "WHEN":
            return st["DRAFT_WHEN"].format(**fmt)
        if topic == "WHAT_TO_DO":
            steps = [policy.reason(r.code).get("step", {}).get("action") for r in precheck.reasons]
            steps = [x for x in steps if x]
            body = st["DRAFT_NEXT"]
            if steps:
                body += " Чтобы повысить шансы: " + "; ".join(steps) + "."
            return body
        if topic == "AMOUNT":
            body = f"Вы просите {rub(precheck.requested_amount)}, {rng}."
            if high and precheck.requested_amount > high:
                body += f" Сумма выше оценки — на шаге «Предложение» есть вариант в пределах {rub(high)}, по нему шансы выше."
            elif precheck.cost:
                body += f" Условия на запрошенную сумму: {_cost_text(precheck.cost)}."
            return f"{body} {precheck.disclaimer}"
        reasons = [r.text for r in precheck.reasons]
        body = f"Предварительный шанс — {chance}: {rng}."
        body += (" Что влияет: " + "; ".join(reasons) + ".") if reasons else " Серьёзных ограничений по текущим данным не видно."
        if precheck.owner_note:
            body += f" {precheck.owner_note}"
        return f"{body} {precheck.disclaimer}"

    # Одобрено и дальше: условия решения, стадия оформления
    cost = decision.cost if decision else None
    if stage in {"OFFER_ACCEPTED", "SIGNED", "DISBURSED"} and topic in {"WHAT_TO_DO", "WHEN"}:
        return st[stage]
    if topic == "WHAT_TO_DO":
        return st["APPROVED_NEXT"].format(**fmt)
    if topic == "WHEN":
        return st["APPROVED_WHEN"].format(**fmt)
    if topic == "AMOUNT" and cost:
        return f"Условия банка: {_cost_text(cost)}."
    body = f"Решение: одобрено — {_cost_text(cost)}." if cost else "Решение: одобрено."
    if decision:
        strong = [f.label.lower() for f in decision.score.factors if f.points == f.max_points][:3]
        body += f" Оценка — {decision.score.score} баллов из {decision.score.max_score}, стоп-факторов нет."
        if strong:
            body += " Сильные стороны: " + ", ".join(strong) + "."
    if stage in {"OFFER_ACCEPTED", "SIGNED", "DISBURSED"}:
        body += " " + st[stage]
    return body


STAGE_TEXT = {
    "DRAFT": "заявка ещё не отправлена", "SUBMITTED": "заявка отправлена, банк её проверяет",
    "IN_REVIEW": "заявка отправлена, банк её проверяет", "SPECIALIST_REVIEW": "заявку рассматривает специалист банка",
    "APPROVED": "банк одобрил заявку, клиент ещё не принял условия", "OFFER_ACCEPTED": "клиент принял условия, договор не подписан",
    "SIGNED": "договор подписан, деньги перечисляются", "DISBURSED": "деньги перечислены на счёт клиента",
}


def _good_facts(policy: Policy, stage: str | None, decision: Decision | None, precheck: Precheck | None,
                tmpl: str) -> list[str]:
    """Факты для LLM: сам шаблонный ответ (он уже собран из данных заявки) и стадия человеческими словами."""
    out = [f"Где сейчас заявка: {STAGE_TEXT[stage]}."] if stage in STAGE_TEXT else []
    out.append(tmpl)
    if precheck and not decision:
        out += _precheck_facts(precheck)
    if decision and decision.cost:
        out.append(f"Условия банка: {_cost_text(decision.cost)}.")
    return out


SYSTEM = (
    "Ты помогаешь предпринимателю понять решение банка по его заявке. Отвечай на вопрос 2–4 предложениями, на «вы», "
    "простыми словами и только по фактам ниже. Не добавляй новых чисел, причин, сроков и советов. Не обещай одобрение "
    "и не пиши слово «одобрено». Если вопрос не про заявку или банковские термины — вежливо верни к заявке."
)

SYSTEM_GOOD = (
    "Ты помогаешь предпринимателю с его заявкой на кредит на любом этапе. Ответь на вопрос 2–4 предложениями, на «вы», "
    "простыми словами и только по фактам ниже: перескажи главное из них. Сохрани суммы и сроки ровно как в фактах, "
    "не добавляй новых чисел, причин, сроков и советов. Об одобрении говори, только если оно есть в фактах; "
    "до решения банка ничего не обещай."
)


def answer(policy: Policy, question: str, decision: Decision | None, route: Route | None,
           use_llm: bool = True, stage: str | None = None, precheck: Precheck | None = None) -> AssistantAnswer:
    a = policy.raw["assistant"]
    noncredit = (decision and decision.outcome == "SUSPENDED_115FZ") or (route and route.holds == "NONCREDIT")
    if noncredit:
        text = f"{policy.reason('Z_115')['text']} {a['noncredit_extra']}"
        return AssistantAnswer(answer=text, template_answer=text, source="TEMPLATE", topic="NONCREDIT")

    terms = find_terms(policy, question)
    topic = classify(question, terms)
    # Всё в порядке (черновик, проверка, одобрение и оформление) — отвечаем по стадии, без маршрута
    good = (stage in GOOD_STAGES and not route) or (decision is not None and decision.outcome == "APPROVED" and not route) \
        or (decision is None and route is None)
    if good:
        tmpl = good_template(policy, topic, stage, decision, precheck, terms)
        known = _good_facts(policy, stage, decision, precheck, tmpl)
    else:
        tmpl = template(policy, topic, question, decision, route, terms)
        known = None
    result = AssistantAnswer(answer=tmpl, template_answer=tmpl, source="TEMPLATE", topic=topic,
                             terms=[t["term"] for t in terms])
    if not use_llm or topic == "OFF_TOPIC" or any(t["term"] == "115-ФЗ" for t in terms):
        return result                                   # про 115-ФЗ — только фиксированный текст
    known = (known if known is not None else facts(policy, decision, route, topic)) \
        + [f"{t['term']}: {t['plain']}. {t['more']}" for t in terms]
    out = llm.chat(SYSTEM_GOOD if good else SYSTEM, "Факты:\n- " + "\n- ".join(known) + f"\n\nВопрос клиента: {question}",
                   temperature=0.2, timeout=llm.TEXT_TIMEOUT) if llm.ready() else None
    if not isinstance(out, str):
        return result.model_copy(update={"fallback_reason": "LLM недоступна"})
    problem = check_llm_text(out, tmpl + " " + " ".join(known), decision.outcome if decision else None)
    if problem:
        return result.model_copy(update={"fallback_reason": problem})
    return result.model_copy(update={"answer": out, "source": "LLM"})
