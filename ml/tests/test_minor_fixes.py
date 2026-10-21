"""Мелочи из итоговой проверки: пустые вопросы, обрезанные ответы, «115 000 ₽», заголовки «Погоды» из конфига."""
import copy

from conftest import applicant
from fastapi.testclient import TestClient

from service import llm
from service.config import Policy, get_policy
from service.decision import decide
from service.explain import check_llm_text
from service.finance import weather
from service.main import app

client = TestClient(app)


def test_whitespace_only_question_is_422():
    d = client.post("/v1/decision", json=__import__("conftest").PERSONAS["P3"]["decision"]).json()
    assert client.post("/v1/assistant", json={"question": "   ", "context": {"decision": d}}).status_code == 422
    assert client.post("/v1/intent", json={"text": "  \n "}).status_code == 422


def test_cut_off_llm_answer_is_rejected():
    template = "Главная причина: Налоговая задолженность. Решение принимает банк по правилам."
    assert check_llm_text("Главная причина — налоговая задолженность. Сначала погасите", template, "REJECTED")


def test_amount_115_thousand_is_not_mistaken_for_115_fz():
    template = "Банк может предложить 115 000 ₽ на 12 мес."
    assert check_llm_text("Банк может предложить 115 000 ₽ на 12 месяцев.", template, "COUNTER_OFFER") is None
    assert check_llm_text("Это связано с 115-ФЗ.", template, "COUNTER_OFFER")


def test_weather_titles_follow_config_numbers():
    p = get_policy()
    raw = copy.deepcopy(p.raw)
    raw["weather"]["rate_up_pp"] = 3.0
    raw["weather"]["overdue_days"] = 60
    changed = Policy(raw, {"reasons": p.reasons}, {"terms": p.glossary})
    rows = {r.code: r for r in weather(changed, "WORKING_CAPITAL", 850_000, 24).rows}
    assert "3 п.п." in rows["RATE_UP"].title and "60 дней" in rows["OVERDUE_30"].title


def test_default_model_constant_does_not_depend_on_env():
    assert llm.DEFAULT_MODEL == "qwen3:1.7b"
