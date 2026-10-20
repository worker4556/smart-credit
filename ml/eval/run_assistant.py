"""Замер помощника при отказе (спека, раздел 5.5).

    OLLAMA_URL= uv run python -m eval.run_assistant                                  # без LLM: проверка самого раннера
    OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=qwen3:1.7b uv run python -m eval.run_assistant

Пороги: ответы LLM, прошедшие проверку, ≥ 80%; вопросы не по теме → OFF_TOPIC 100%; медиана времени ≤ 30 с.
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

from service import llm
from service.assistant import answer
from service.config import get_policy
from service.decision import decide
from service.route import build_route
from service.schemas import Applicant

ROOT = Path(__file__).resolve().parent.parent
LLM_SHARE, MEDIAN_SECONDS = 0.80, 30.0


def main() -> int:
    policy = get_policy()
    personas = json.loads((ROOT / "fixtures" / "personas.json").read_text("utf-8"))
    rows = [json.loads(x) for x in (ROOT / "eval" / "assistant_questions.jsonl").read_text("utf-8").splitlines() if x.strip()]
    use_llm = llm.ready()
    times, llm_ok, on_topic_total, off_ok, off_total, topic_ok = [], 0, 0, 0, 0, 0
    for row in rows:
        a = Applicant(**personas[row["persona"]]["decision"])
        d = decide(policy, a)
        r = build_route(policy, a) if d.outcome in ("REJECTED", "COUNTER_OFFER") else None
        started = time.perf_counter()
        res = answer(policy, row["question"], d, r, use_llm=use_llm)
        times.append(time.perf_counter() - started)
        topic_ok += res.topic == row["expect_topic"]
        if row["off_topic"]:
            off_total += 1
            off_ok += res.topic == "OFF_TOPIC"
        else:
            on_topic_total += 1
            llm_ok += res.source == "LLM"
            if use_llm and res.source != "LLM":
                print(f"✗ {row['persona']}: {row['question']} → шаблон ({res.fallback_reason})")
    median = statistics.median(times)
    share = llm_ok / on_topic_total
    print(f"\nРежим: {'LLM ' + llm.OLLAMA_MODEL if use_llm else 'без LLM (только шаблоны)'}; вопросов: {len(rows)}")
    print(f"  ответы LLM прошли проверку  {share:6.1%}   (порог ≥ {LLM_SHARE:.0%})")
    print(f"  не по теме → OFF_TOPIC       {off_ok}/{off_total}")
    print(f"  тема распознана              {topic_ok}/{len(rows)}")
    print(f"  медиана времени ответа       {median:6.2f} с (порог ≤ {MEDIAN_SECONDS:.0f} с)")
    passed = off_ok == off_total and median <= MEDIAN_SECONDS and (share >= LLM_SHARE if use_llm else True)
    print("Пороги:", "пройдены" if passed else "НЕ пройдены")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
