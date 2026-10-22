"""Помощник отвечает и когда с заявкой всё в порядке: до подачи, на проверке, после одобрения и выдачи.
Принцип прежний: шаблон из фактов заявки, LLM только переформулирует и проходит ту же проверку."""
from conftest import applicant, precheck_applicant
from fastapi.testclient import TestClient

from service.assistant import answer
from service.decision import decide, precheck
from service.main import app

client = TestClient(app)


def test_draft_with_precheck_why_names_chance_and_range(policy):
    p = precheck(policy, precheck_applicant("P1"))
    a = answer(policy, "почему такой шанс?", None, None, use_llm=False, stage="DRAFT", precheck=p)
    assert a.topic == "WHY"
    assert "высокий" in a.answer
    assert "1 250 000 ₽" in a.answer and "1 400 000 ₽" in a.answer
    assert "одобр" not in a.answer.lower()            # до подачи не обещаем одобрение


def test_draft_what_to_do_explains_next_step_and_ways_to_improve(policy):
    p = precheck(policy, precheck_applicant("P2"))
    a = answer(policy, "что мне делать?", None, None, use_llm=False, stage="DRAFT", precheck=p)
    assert a.topic == "WHAT_TO_DO"
    assert "два согласия" in a.answer
    assert "Чтобы повысить шансы" in a.answer


def test_draft_amount_above_estimate_points_to_alternative(policy):
    p = precheck(policy, precheck_applicant("P2"))
    a = answer(policy, "почему такая сумма?", None, None, use_llm=False, stage="DRAFT", precheck=p)
    assert a.topic == "AMOUNT"
    assert "3 000 000 ₽" in a.answer and "2 850 000 ₽" in a.answer


def test_draft_without_precheck_guides_through_steps(policy):
    a = answer(policy, "что делать?", None, None, use_llm=False, stage="DRAFT")
    assert "Предложение" in a.answer


def test_in_review_says_nothing_to_do_and_no_speed_promise(policy):
    a = answer(policy, "когда будет решение?", None, None, use_llm=False, stage="IN_REVIEW")
    assert "ничего не нужно" in a.answer.lower()
    assert "не обещает" in a.answer


def test_approved_next_step_and_offer_validity(policy):
    d = decide(policy, applicant("P1"))
    a = answer(policy, "что дальше?", d, None, use_llm=False, stage="APPROVED")
    assert "Принять условия" in a.answer and "30 дней" in a.answer


def test_approved_why_lists_strengths(policy):
    d = decide(policy, applicant("P1"))
    a = answer(policy, "почему одобрили?", d, None, use_llm=False, stage="APPROVED")
    assert "100 баллов из 100" in a.answer
    assert "Сильные стороны" in a.answer


def test_overdraft_cost_is_interest_plus_fee(policy):
    from conftest import with_statement
    d = decide(policy, with_statement("P5"))
    a = answer(policy, "сколько это стоит?", d, None, use_llm=False, stage="APPROVED")
    assert "проценты" in a.answer and "3 000 ₽" in a.answer and "5 425 ₽" in a.answer


def test_disbursed_and_signed_stages(policy):
    d = decide(policy, applicant("P1"))
    assert "перечислены" in answer(policy, "что дальше?", d, None, use_llm=False, stage="DISBURSED").answer
    assert "Подписать договор" in answer(policy, "что дальше?", d, None, use_llm=False, stage="OFFER_ACCEPTED").answer


def test_terms_work_in_any_stage(policy):
    a = answer(policy, "что такое полная стоимость кредита?", None, None, use_llm=False, stage="DRAFT")
    assert a.topic == "TERM"


def test_good_stage_llm_cannot_add_numbers(policy, fake_llm):
    fake_llm("Вам одобрят 5 000 000 ₽ под 3%.")
    p = precheck(policy, precheck_applicant("P1"))
    a = answer(policy, "почему такой шанс?", None, None, stage="DRAFT", precheck=p)
    assert a.source == "TEMPLATE" and a.fallback_reason


def test_endpoint_accepts_stage_without_decision():
    r = client.post("/v1/assistant", json={"question": "что делать дальше?", "context": {"stage": "IN_REVIEW"}, "use_llm": False})
    assert r.status_code == 200, r.text
    assert "ничего не нужно" in r.json()["answer"].lower()


def test_endpoint_still_requires_some_context():
    r = client.post("/v1/assistant", json={"question": "что делать?", "context": {}, "use_llm": False})
    assert r.status_code == 422


def test_what_to_do_phrasings(policy):
    d = decide(policy, applicant("P1"))
    for q in ["что мне теперь делать?", "что сейчас делать", "как быть дальше?", "куда нажать?"]:
        assert answer(policy, q, d, None, use_llm=False, stage="APPROVED").topic == "WHAT_TO_DO", q


def test_greeting_and_capabilities_are_answered_not_rejected(policy):
    d = decide(policy, applicant("P1"))
    for q in ["привет", "Здравствуйте!", "добрый день"]:
        a = answer(policy, q, d, None, use_llm=False, stage="APPROVED")
        assert a.answer.startswith("Здравствуйте") and "Спросите" in a.answer, q
    for q in ["а что еще можно узгнать?", "что ты умеешь?", "чем можешь помочь?", "о чём можно спросить?"]:
        a = answer(policy, q, d, None, use_llm=False, stage="APPROVED")
        assert "Спросите, например" in a.answer, q


def test_small_talk_does_not_hijack_real_questions(policy):
    d = decide(policy, applicant("P1"))
    assert answer(policy, "что можно сделать дальше?", d, None, use_llm=False, stage="APPROVED").topic == "WHAT_TO_DO"
    assert answer(policy, "привет, почему одобрили?", d, None, use_llm=False, stage="APPROVED").topic == "WHY"
