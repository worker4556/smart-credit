"""Выгрузка контракта backend из кода: uv run python -m app.export_openapi → docs/openapi-backend.json."""
from __future__ import annotations

import json
from pathlib import Path

from app.main import app

TARGET = Path(__file__).resolve().parents[2] / "docs" / "openapi-backend.json"


def render() -> str:
    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> None:
    TARGET.write_text(render(), encoding="utf-8")
    print(f"written {TARGET}")


if __name__ == "__main__":
    main()
