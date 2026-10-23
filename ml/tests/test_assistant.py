"""Помощник при отказе и нехватке: отвечает только по фактам решения и маршрута, LLM не может подсунуть лишнего."""
import pytest
from conftest import PERSONAS, applicant
from fastapi.testclient import TestClient

from service import llm
from service.assistant import answer
from service.decision import decide
from service.main import app
from service.route import build_route

client = TestClient(app)


def test_why_for_p3_template(policy):
    a = answer(policy, "почему мне отказали?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "WHY" and "Налоговая задолженность" in a.answer and a.source == "TEMPLATE"
    assert a.answer.endswith("Решение принимает банк по правилам. Помощник только объясняет.")


def test_what_to_do_uses_route(policy):
    r = build_route(policy, applicant("P3"))
    a = answer(policy, "что мне сделать?", decide(policy, applicant("P3")), r, use_llm=False)
    assert a.topic == "WHAT_TO_DO" and "Погасить сальдо ЕНС" in a.answer and "~3 мес." in a.answer


def test_term_question(policy):
    a = answer(policy, "что такое долговая нагрузка?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "TERM" and "Какая часть дохода уходит на платежи по кредитам" in a.answer
    assert a.terms == ["Долговая нагрузка"]


def test_p4_no_shortcut(policy):
    r = build_route(policy, applicant("P4"))
    a = answer(policy, "когда можно подать снова?", decide(policy, applicant("P4")), r, use_llm=False)
    assert a.topic == "WHEN" and "ускорить нельзя" in a.answer


def test_p5_what_to_upload(policy):
    a = answer(policy, "что нужно загрузить?", decide(policy, applicant("P5")), None, use_llm=False)
    assert a.topic == "WHAT_TO_DO" and "выписку другого банка" in a.answer


def test_p2_why_less(policy):
    a = answer(policy, "почему дают меньше?", decide(policy, applicant("P2")), None, use_llm=False)
    assert a.topic == "AMOUNT" and "2 850 000 ₽" in a.answer and "3 000 000 ₽" in a.answer


def test_115_never_calls_llm(policy, monkeypatch):
    monkeypatch.setattr(llm, "chat", lambda *a, **k: pytest.fail("LLM вызвана для 115-ФЗ"))
    a = answer(policy, "почему?", decide(policy, applicant("ZSK")), None)
    assert a.topic == "NONCREDIT" and a.source == "TEMPLATE" and "115-ФЗ" in a.answer


def test_approved_explains_terms_instead_of_not_needed(policy):
    # Раньше при одобрении помощник отвечал «помощь не нужна»; теперь объясняет условия по фактам решения
    a = answer(policy, "почему?", decide(policy, applicant("P1")), None, use_llm=False)
    assert a.topic == "WHY"
    assert "850 000 ₽" in a.answer and "43 261 ₽" in a.answer and "196 774 ₽" in a.answer


def test_llm_answer_accepted_when_faithful(policy, fake_llm):
    fake_llm("Главная причина — налоговая задолженность. Сначала погасите сальдо ЕНС.")
    a = answer(policy, "почему отказ?", decide(policy, applicant("P3")), None)
    assert a.source == "LLM" and a.template_answer != a.answer


@pytest.mark.parametrize("bad", ["Возьмите 2 000 000 ₽ — так одобрят.", "Причина S_TAX.",
                                 "Гарантирую одобрение через месяц."])
def test_llm_answer_rejected(policy, fake_llm, bad):
    fake_llm(bad)
    a = answer(policy, "а если взять 2 млн?", decide(policy, applicant("P3")), None)
    assert a.source == "TEMPLATE" and a.fallback_reason and a.answer == a.template_answer


def test_llm_not_ready_falls_back(policy, monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_URL", "http://fake")
    monkeypatch.setattr(llm, "ready", lambda: False)
    a = answer(policy, "почему отказ?", decide(policy, applicant("P3")), None)
    assert a.source == "TEMPLATE"


def test_off_topic(policy):
    a = answer(policy, "какая погода в Москве?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "OFF_TOPIC" and "разобраться с решением" in a.answer


def test_endpoint_answers():
    d = client.post("/v1/decision", json=PERSONAS["P3"]["decision"]).json()
    r = client.post("/v1/assistant", json={"question": "почему отказ?", "context": {"decision": d}, "use_llm": False})
    assert r.status_code == 200 and r.json()["topic"] == "WHY"


def test_endpoint_validation():
    assert client.post("/v1/assistant", json={"question": "", "context": {}}).status_code == 422
    assert client.post("/v1/assistant", json={"question": "x" * 501, "context": {}}).status_code == 422
    assert client.post("/v1/assistant", json={"question": "почему?", "context": {}}).status_code == 422


def test_what_does_it_mean_without_term_explains_decision(policy):
    a = answer(policy, "что это значит?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "WHY" and "Налоговая задолженность" in a.answer


@pytest.mark.parametrize("question,topic", [
    ("можно как-то ускорить?", "WHEN"),
    ("зачем вам выписка из другого банка?", "WHY"),
    ("что будет после загрузки?", "WHAT_TO_DO"),
])
def test_classify_everyday_wording(policy, question, topic):
    from service.assistant import classify
    from service.glossary import find_terms
    assert classify(question, find_terms(policy, question)) == topic


# ---------- исправления по итоговой проверке ----------

@pytest.mark.parametrize("persona,bad", [
    ("P3", "Если взять 2 млн, шансы вырастут."),
    ("P3", "Возьмите 1 млн — так проще."),
    ("P4", "С 3 млн вам дадут через 2 месяца."),
])
def test_llm_cannot_echo_client_number_or_promise(policy, fake_llm, persona, bad):
    fake_llm(bad)
    r = build_route(policy, applicant(persona))
    a = answer(policy, "а если взять 2 млн?", decide(policy, applicant(persona)), r)
    assert a.source == "TEMPLATE" and a.fallback_reason


def test_llm_cannot_offer_the_requested_amount(policy, fake_llm):
    fake_llm("Банк готов выдать вам 3 000 000 ₽ на 18 мес.")
    a = answer(policy, "почему отказ?", decide(policy, applicant("P2")), build_route(policy, applicant("P2")))
    assert a.source == "TEMPLATE"


def test_term_115_never_goes_to_llm_and_does_not_say_suspended(policy, monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_URL", "http://fake")
    monkeypatch.setattr(llm, "ready", lambda: True)
    monkeypatch.setattr(llm, "chat", lambda *a, **k: pytest.fail("LLM вызвана для 115-ФЗ"))
    a = answer(policy, "что такое 115-ФЗ?", decide(policy, applicant("P3")), None)
    assert a.topic == "TERM" and a.source == "TEMPLATE" and "приостановлена" not in a.answer


def test_psk_question_answer_does_not_say_psk(policy):
    for q in ("что такое ПСК?", "что такое переплата?"):
        a = answer(policy, q, decide(policy, applicant("P3")), None, use_llm=False)
        assert a.topic == "TERM" and "ПСК" not in a.answer


def test_disclaimer_paraphrase_with_approval_genitive_is_accepted(policy, fake_llm):
    fake_llm("Ориентир — примерно 3 месяца. Это ориентир, а не обещание одобрения.")
    r = build_route(policy, applicant("P3"))
    assert answer(policy, "когда подать снова?", decide(policy, applicant("P3")), r).source == "LLM"


def test_amount_answer_for_full_amount_counter_offer_talks_about_rate(policy):
    d = decide(policy, applicant("P2"))
    d = d.model_copy(update={"amount": d.requested_amount,
                             "cost": d.cost.model_copy(update={"amount": d.requested_amount, "rate": 22.0})})
    a = answer(policy, "почему не вся сумма?", d, None, use_llm=False)
    assert "Почему не вся сумма" not in a.answer and "22%" in a.answer and "20%" in a.answer


# ---------- свободные вопросы о задаче бизнеса не считаются «не по теме» ----------

@pytest.mark.parametrize("question,topic", [
    ("хочу открыть вторую кофейню, сколько мне дадут?", "AMOUNT"),
    ("сколько можно получить?", "AMOUNT"),
    ("хочу открыть вторую кофейню", "GOAL"),
    ("мне дадут кредит?", "GOAL"),
    ("какая погода в Москве?", "OFF_TOPIC"),
])
def test_free_questions_classified(question, topic):
    from service.assistant import classify
    from service.glossary import find_terms
    from service.config import get_policy
    assert classify(question, find_terms(get_policy(), question)) == topic


def test_draft_without_precheck_explains_how_to_get_amount(policy):
    for q in ("хочу открыть вторую кофейню, сколько мне дадут?", "мне дадут кредит?"):
        a = answer(policy, q, None, None, use_llm=False, stage="DRAFT")
        assert a.topic != "OFF_TOPIC" and "предварительная оценка" in a.answer and "«Предложение»" in a.answer


def test_goal_question_with_precheck_answers_by_estimate(policy):
    from conftest import precheck_applicant
    from service.decision import precheck
    p = precheck(policy, precheck_applicant("P1"))
    a = answer(policy, "хочу открыть вторую кофейню", None, None, use_llm=False, stage="DRAFT", precheck=p)
    assert a.topic == "GOAL" and "Предварительный шанс" in a.answer


def test_goal_question_after_rejection_names_reason(policy):
    a = answer(policy, "мне дадут кредит?", decide(policy, applicant("P3")), build_route(policy, applicant("P3")),
               use_llm=False, stage="REJECTED")
    assert a.topic == "GOAL" and "налоговая задолженность" in a.answer.lower()


def test_goal_question_goes_to_llm(policy, fake_llm):
    fake_llm("Сколько банк сможет дать, покажет предварительная оценка на шаге «Предложение». Это ещё не решение банка.")
    a = answer(policy, "хочу открыть вторую кофейню", None, None, stage="DRAFT")
    assert a.topic == "GOAL" and a.source == "LLM"


def test_amount_question_without_available_sum_names_the_obstacle(policy):
    from conftest import precheck_applicant
    from service.decision import precheck
    p = precheck(policy, precheck_applicant("P3"))
    assert p.amount_range.high == 0
    a = answer(policy, "сколько мне дадут?", None, None, use_llm=False, stage="DRAFT", precheck=p)
    assert "Главное препятствие" in a.answer and "Условия на запрошенную сумму" not in a.answer
