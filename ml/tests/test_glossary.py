"""Словарь терминов: «Макет», раздел 4 — дословно; поиск по формам слова."""
from fastapi.testclient import TestClient

from service.config import get_policy
from service.glossary import find_terms, lookup
from service.main import app

client = TestClient(app)


def test_glossary_has_maket_terms_verbatim(policy):
    assert lookup(policy, "Овердрафт")["plain"] == "Деньги сверх остатка на счёте. Платите только за дни, когда они взяты"
    assert lookup(policy, "Долговая нагрузка")["plain"] == "Какая часть дохода уходит на платежи по кредитам"
    assert len(policy.glossary) >= 22


def test_find_terms_by_alias():
    found = [t["term"] for t in find_terms(get_policy(), "Нужен лимит овердрафта, а ещё долг по ЕНС")]
    assert found == ["Лимит", "Овердрафт", "ЕНС"]


def test_find_terms_ignores_word_inside_other_word():
    assert find_terms(get_policy(), "поставка товара") == []


def test_glossary_endpoints():
    assert client.get("/v1/glossary").json()["items"]
    assert client.get("/v1/glossary/ОВЕРДРАФТ").status_code == 200
    assert client.get("/v1/glossary/неизвестное").status_code == 404


def test_our_texts_never_say_psk(policy):
    for t in policy.glossary:
        assert "ПСК" not in t["term"] + t["plain"] + t["more"]
