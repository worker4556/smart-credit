"""Человеческие объяснения решения: шаблоны + опциональный LLM (open-weights через Ollama).

Без LLM всё работает: шаблонный текст — основной путь, LLM лишь переформулирует.
"""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "")  # пусто — LLM выключен
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT_SECONDS", "5"))

REASON_TEXT = {
    "DSCR_LOW": "ежемесячный платёж слишком высок относительно выручки",
    "AMOUNT_ABOVE_LIMIT": "запрошенная сумма выше доступного лимита",
    "OVERDUE_90": "в кредитной истории есть просрочка более 90 дней",
    "OVERDUE": "в кредитной истории есть просрочки",
    "TAX_DEBT": "есть задолженность перед налоговой",
    "COMPANY_INACTIVE": "компания не действует по данным ЕГРЮЛ",
    "FICTITIOUS_SIGNS": "есть признаки фиктивности: массовый адрес или массовый руководитель",
    "YOUNG_BUSINESS": "бизнес работает меньше 6 месяцев",
    "REVENUE_UNCONFIRMED": "выручка не подтверждена документами",
    "HIGH_RISK": "совокупная оценка риска выше допустимой",
    "BORDERLINE_RISK": "оценка риска на границе — заявку проверит специалист",
}

RECOMMENDATION_BY_REASON = {
    "DSCR_LOW": "Увеличьте срок или уменьшите сумму — платёж станет ниже.",
    "AMOUNT_ABOVE_LIMIT": "Подтвердите выручку выпиской — лимит может вырасти.",
    "OVERDUE_90": "Погасите просрочки: через 12 месяцев без просрочек шансы заметно вырастут.",
    "OVERDUE": "Платите по текущим кредитам вовремя — это быстрее всего улучшает оценку.",
    "TAX_DEBT": "Погасите налоговую задолженность и подайте заявку снова.",
    "YOUNG_BUSINESS": "Загрузите выписку по счёту — это заменит недостающую историю.",
    "REVENUE_UNCONFIRMED": "Загрузите выписку по расчётному счёту за 6 месяцев.",
    "HIGH_RISK": "Посмотрите карту маршрута — там шаги, которые повышают шансы.",
}


def _rub(x: int | float) -> str:
    return f"{int(x):,} ₽".replace(",", " ")


def template_explanation(outcome: str, requested_amount: int, offer: dict | None, reasons: list[str], factors: list[dict]) -> tuple[str, list[str]]:
    reason_phrases = [REASON_TEXT[r] for r in reasons if r in REASON_TEXT]
    because = ("Причина: " + "; ".join(reason_phrases) + ".") if reason_phrases else ""
    negatives = [f["label"].lower() for f in factors if f.get("impact") == "NEGATIVE"][:2]
    positives = [f["label"].lower() for f in factors if f.get("impact") == "POSITIVE"][:2]

    if outcome == "APPROVED" and offer:
        text = (f"Заявка одобрена: {_rub(offer['amount'])} на {offer['term_months']} мес под {offer['rate']}% годовых."
                + (f" Положительно повлияли: {', '.join(positives)}." if positives else ""))
    elif outcome == "COUNTER_OFFER" and offer:
        text = (f"Мы готовы выдать {_rub(offer['amount'])} вместо {_rub(requested_amount)} "
                f"на {offer['term_months']} мес под {offer['rate']}%. {because}").strip()
    elif outcome == "REJECTED":
        text = f"Сейчас мы не можем выдать кредит. {because}".strip()
        if negatives and not reason_phrases:
            text += f" Сильнее всего повлияли: {', '.join(negatives)}."
    elif outcome == "INFO_REQUESTED":
        text = f"Чтобы принять решение, нам нужно немного больше информации. {because}".strip()
    elif outcome == "MANUAL_REVIEW":
        text = "Заявку изучит специалист банка — обычно это занимает до одного рабочего дня."
    else:
        text = because or "Решение принято."

    recs = [RECOMMENDATION_BY_REASON[r] for r in reasons if r in RECOMMENDATION_BY_REASON]
    return text, list(dict.fromkeys(recs))


def llm_rephrase(text: str, outcome: str) -> str | None:
    if not OLLAMA_URL:
        return None
    prompt = (
        "Ты — вежливый сотрудник банка. Перепиши объяснение кредитного решения для предпринимателя "
        "простым дружелюбным языком, 2–3 предложения, без канцелярита, не меняя цифр и фактов, "
        f"ничего не добавляя от себя. Решение: {outcome}.\n\nТекст: {text}"
    )
    try:
        resp = httpx.post(f"{OLLAMA_URL}/api/generate",
                          json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}},
                          timeout=LLM_TIMEOUT)
        resp.raise_for_status()
        out = resp.json().get("response", "").strip()
        return out or None
    except Exception as exc:  # LLM опционален: любая ошибка → шаблон
        log.warning("LLM unavailable, falling back to template: %s", exc)
        return None


def llm_status() -> str:
    return "enabled" if OLLAMA_URL else "disabled"
