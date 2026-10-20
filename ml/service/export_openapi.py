"""Выгрузка контракта ML из кода: uv run python -m service.export_openapi → docs/openapi-ml.yaml."""
from __future__ import annotations

from pathlib import Path

import yaml

from .main import app

TARGET = Path(__file__).resolve().parents[2] / "docs" / "openapi-ml.yaml"


def main() -> None:
    TARGET.write_text(yaml.safe_dump(app.openapi(), allow_unicode=True, sort_keys=True), encoding="utf-8")
    print(f"written {TARGET}")


if __name__ == "__main__":
    main()
