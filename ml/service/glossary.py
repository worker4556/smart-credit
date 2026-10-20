"""Словарь простых слов: поиск терминов в тексте по основам слов (config/glossary.yaml)."""
from __future__ import annotations

import re
from functools import lru_cache

from .config import Policy


@lru_cache(maxsize=None)
def _pattern(stem: str) -> re.Pattern:
    """«долгов нагрузк» → каждое слово начинается с основы, слова подряд."""
    words = [re.escape(w) + r"[\w-]*" for w in stem.lower().split()]
    return re.compile(r"(?<![\w-])" + r"\s+".join(words), re.IGNORECASE)


def find_terms(policy: Policy, text: str) -> list[dict]:
    """Термины, упомянутые в тексте, без повторов, в порядке появления; в одном месте — самый длинный."""
    hits: list[tuple[int, int, dict]] = []
    for t in policy.glossary:
        for stem in t["aliases"]:
            for m in _pattern(stem).finditer(text):
                hits.append((m.start(), m.end(), t))
    hits.sort(key=lambda h: (h[0], -(h[1] - h[0])))
    out: list[dict] = []
    end = -1
    for start, stop, t in hits:
        if start < end:
            continue
        end = stop
        if t not in out:
            out.append(t)
    return out


def lookup(policy: Policy, term: str) -> dict | None:
    """Один термин по названию или любой его форме; запрос должен быть только этим термином."""
    text = term.strip()
    for t in policy.glossary:
        if t["term"].lower() == text.lower():
            return t
        for stem in t["aliases"]:
            m = _pattern(stem).match(text)
            if m and m.end() == len(text):
                return t
    return None
