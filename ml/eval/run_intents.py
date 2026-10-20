"""Проверка ассистента (гипотеза Г4): цель, сумма и срок распознаны верно не ниже 80% на 30 фразах.

    uv run python -m eval.run_intents                 # 30 фраз, только правила
    uv run python -m eval.run_intents holdout         # отложенные 15 фраз (правила под них не настраивались)
    OLLAMA_URL=http://localhost:11434 uv run python -m eval.run_intents   # правила + локальная LLM
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from service import llm
from service.intent import parse

TARGET = 0.80


def main() -> int:
    name = "intents_holdout.jsonl" if "holdout" in sys.argv[1:] else "intents.jsonl"
    rows = [json.loads(line) for line in (Path(__file__).parent / name).read_text("utf-8").splitlines() if line.strip()]
    ok = {"purpose": 0, "amount": 0, "term_months": 0, "all": 0}
    started = time.perf_counter()
    for row in rows:
        got = parse(row["text"], use_llm=llm.enabled())
        hits = {k: getattr(got, k) == row[k] for k in ("purpose", "amount", "term_months")}
        for k, v in hits.items():
            ok[k] += v
        ok["all"] += all(hits.values())
        if not all(hits.values()):
            print(f"✗ {row['text']}\n    ожидали {row['purpose']}/{row['amount']}/{row['term_months']}, "
                  f"получили {got.purpose}/{got.amount}/{got.term_months} ({got.source})")
    n = len(rows)
    mode = f"LLM {llm.OLLAMA_MODEL}" if llm.enabled() else "только правила"
    print(f"\nНабор: {name}; режим: {mode}; фраз: {n}; {time.perf_counter() - started:.1f} с")
    for k in ("purpose", "amount", "term_months", "all"):
        print(f"  {k:12} {ok[k] / n:6.1%}")
    passed = ok["all"] / n >= TARGET
    print("Цель ≥ 80% по всем трём полям:", "достигнута" if passed else "НЕ достигнута")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
