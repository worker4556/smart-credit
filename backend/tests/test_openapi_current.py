"""docs/openapi-backend.json совпадает с кодом — контракт для фронта и жюри не отстаёт."""
from app.export_openapi import TARGET, render


def test_openapi_file_is_current() -> None:
    assert TARGET.read_text(encoding="utf-8") == render(), "перегенерируй: uv run python -m app.export_openapi"
