import json
from pathlib import Path

import pytest

from service import llm
from service.config import get_policy
from service.schemas import Applicant, Owner

PERSONAS = json.loads((Path(__file__).resolve().parent.parent / "fixtures" / "personas.json").read_text("utf-8"))


@pytest.fixture
def policy():
    return get_policy()


def applicant(key: str) -> Applicant:
    """Данные персоны после подачи: БКИ и ЗСК известны."""
    return Applicant(**PERSONAS[key]["decision"])


def precheck_applicant(key: str) -> Applicant:
    """Данные персоны до подачи: владелец со слов клиента, ЗСК неизвестен."""
    a = applicant(key)
    return a.model_copy(update={"owner": Owner(**PERSONAS[key]["precheck_owner"]),
                                "company": a.company.model_copy(update={"zsk_level": None})})


def with_statement(key: str) -> Applicant:
    """P5 после дозагрузки выписки второго банка."""
    a = applicant(key)
    return a.model_copy(update={"account": a.account.model_copy(
        update={"external_turnover_monthly": PERSONAS[key]["statement_external_turnover"]})})


@pytest.fixture(autouse=True)
def _fresh_llm_ready_cache():
    llm.reset_ready_cache()
    yield
    llm.reset_ready_cache()


@pytest.fixture
def fake_llm(monkeypatch):
    """Подменяет ответ модели; LLM считается включённой и готовой."""
    def install(answer):
        monkeypatch.setattr(llm, "OLLAMA_URL", "http://fake")
        monkeypatch.setattr(llm, "ready", lambda: True)
        monkeypatch.setattr(llm, "chat", lambda *a, **kw: answer)
    return install
