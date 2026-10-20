"""Документы не расходятся с кодом и конфигом: контракт, инструкция бэкенду, README, решения."""
import re
from pathlib import Path

import yaml

from service.main import app

REPO = Path(__file__).resolve().parents[2]
OPENAPI_FILE = REPO / "docs" / "openapi-ml.yaml"
API_CONTRACT = REPO / "docs" / "api-contract.md"
BACKEND_MD_FILE = REPO / "backend" / "INSTRUCTIONS.md"
DECISIONS_MD_FILE = REPO / "docs" / "decisions.md"
ML_README_FILE = REPO / "ml" / "README.md"


def read(p: Path) -> str:
    return p.read_text("utf-8")


def api_contract_section(letter: str) -> str:
    text = read(API_CONTRACT)
    start = text.index(f"# {letter}. ")
    end = text.find("\n# ", start + 3)
    return text[start:end if end != -1 else None]


def ml_paths() -> set[str]:
    return set(app.openapi()["paths"])


def test_openapi_file_is_current():
    assert yaml.safe_load(read(OPENAPI_FILE)) == app.openapi(), "перегенерируй: uv run python -m service.export_openapi"


def test_contract_section_c_mentions_every_endpoint():
    section_c = api_contract_section("C")
    mentioned = set(re.findall(r"/v1/[a-z]+(?:/\{[a-z_]+\})?", section_c)) | ({"/health"} if "/health" in section_c else set())
    assert ml_paths() <= mentioned, ml_paths() - mentioned


def test_backend_instructions_use_existing_ml_paths():
    used = set(re.findall(r"(?<!/api)/v1/[a-z]+", read(BACKEND_MD_FILE)))  # /api/v1/… — пути самого бэкенда
    base = {p.split("/{")[0] for p in ml_paths()}
    assert used and used <= base, used - base


def test_numbers_in_docs_match_policy(policy):
    wc, od = policy.products["WORKING_CAPITAL"], policy.products["OVERDRAFT"]
    for f in (DECISIONS_MD_FILE, ML_README_FILE, BACKEND_MD_FILE):
        assert f"{wc['min_term']}–{wc['max_term']} мес" in read(f), f.name
    readme = read(ML_README_FILE)
    assert f"{wc['rate']:g}%" in readme and f"{od['rate']:g}%" in readme
    w = policy.raw["weather"]
    assert f"+{w['rate_up_pp']:g} п.п." in read(DECISIONS_MD_FILE)


def test_backend_timeouts_and_llm_match_design():
    backend = read(BACKEND_MD_FILE)
    assert "timeout=40" in backend
    assert "timeout=20` и **только в фоне**" not in backend
    assert "--profile llm" not in backend and "профиль `llm`" not in backend


def test_model_default_is_the_same_everywhere():
    from service import llm
    compose = read(REPO / "docker-compose.yml")
    env = read(REPO / ".env.example")
    assert f"OLLAMA_MODEL:-{llm.OLLAMA_MODEL}" in compose and f"OLLAMA_MODEL={llm.OLLAMA_MODEL}" in env
    assert llm.OLLAMA_MODEL in read(ML_README_FILE)
