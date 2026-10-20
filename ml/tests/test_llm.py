"""Разбор фразы и пересказ причин: правила работают без LLM, LLM не может подсунуть числа и решения."""
import pytest
from conftest import applicant

from service import explain, intent, llm
from service.decision import decide
from service.route import build_route


# ---------- разбор фразы ----------

@pytest.mark.parametrize("text,purpose,amount,term,product", [
    ("нужно 800 тыс. на закупку к сезону", "PURCHASE", 800_000, None, "WORKING_CAPITAL"),
    ("нужен запас на месяц, выручка около 900 тыс, хочу 300 тыс", "CASH_GAP", 300_000, 1, "OVERDRAFT"),
    ("1,2 млн на запчасти и расходники, на два года", "PURCHASE", 1_200_000, 24, "WORKING_CAPITAL"),
    ("кассовый разрыв на 2 месяца, примерно полмиллиона", "CASH_GAP", 500_000, 2, "OVERDRAFT"),
])
def test_rules_parse(text, purpose, amount, term, product):
    got = intent.parse(text, use_llm=False)
    assert (got.purpose, got.amount, got.term_months, got.product) == (purpose, amount, term, product)
    assert got.needs_confirmation and got.source == "RULES"


def test_missing_fields_go_to_form():
    got = intent.parse("нужны деньги", use_llm=False)
    assert got.amount is None and "amount" in got.missing


def test_llm_cannot_invent_amount(fake_llm):
    fake_llm({"purpose": "PURCHASE", "amount_rub": 5_000_000, "term_months": 24})
    got = intent.parse("нужно 800 тыс. на закупку к сезону")
    assert got.amount == 800_000          # 5 млн во фразе нет — отброшено
    assert got.term_months is None        # срока во фразе нет — отброшен


def test_llm_resolves_purpose(fake_llm):
    fake_llm({"purpose": "EQUIPMENT", "amount_rub": 700_000, "term_months": 24})
    got = intent.parse("купить второй гриль и вытяжку, около 700 тыс на 24 мес")
    assert (got.purpose, got.amount, got.term_months, got.source) == ("EQUIPMENT", 700_000, 24, "LLM")


def test_llm_down_falls_back_to_rules(fake_llm):
    fake_llm(None)
    got = intent.parse("нужно 800 тыс. на закупку к сезону")
    assert got.source == "RULES" and got.amount == 800_000


# ---------- пересказ ----------

def test_template_has_exact_numbers(policy):
    e = explain.explain_decision(policy, decide(policy, applicant("P2")), use_llm=False)
    assert "3 000 000 ₽" in e.text and "2 850 000 ₽" in e.text and "184 575 ₽" in e.text
    assert e.source == "TEMPLATE"
    assert "одобр" not in e.text.lower()


def test_llm_text_accepted_when_faithful(policy, fake_llm):
    fake_llm("Вы просили 3 000 000 ₽, банк готов дать 2 850 000 ₽ на 18 мес. Платёж — 184 575 ₽ в месяц, "
             "всего переплата 500 852 ₽. Сумму ограничивает оборот.")
    e = explain.explain_decision(policy, decide(policy, applicant("P2")))
    assert e.source == "LLM"


@pytest.mark.parametrize("bad,why", [
    ("Банк готов дать 2 900 000 ₽.", "числа"),
    ("Причина L_TURNOVER: оборот.", "код"),
    ("Не переживайте, кредит вам одобрят после проверки.", "одобрено"),
    ("Гарантируем выдачу 2 850 000 ₽.", "запрещённая"),
])
def test_llm_text_rejected(policy, fake_llm, bad, why):
    fake_llm(bad)
    e = explain.explain_decision(policy, decide(policy, applicant("P2")))
    assert e.source == "TEMPLATE"
    assert why in e.fallback_reason


def test_115fz_never_goes_to_llm(policy, monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_URL", "http://fake")
    monkeypatch.setattr(llm, "chat", lambda *a, **kw: pytest.fail("LLM вызвана для 115-ФЗ"))
    d = decide(policy, applicant("ZSK"))
    assert explain.explain_decision(policy, d).source == "TEMPLATE"
    assert explain.explain_route(policy, build_route(policy, applicant("ZSK"))).source == "TEMPLATE"


def test_route_template_mentions_steps_and_disclaimer(policy):
    e = explain.explain_route(policy, build_route(policy, applicant("P3")), use_llm=False)
    assert "Погасить сальдо ЕНС" in e.text and "~3 мес." in e.text and "не обещание" in e.text
