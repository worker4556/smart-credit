"""Проверка балльной карты так, как проверяют скоринговые модели (кейс, стр. 14):
различение заёмщиков (Gini, KS), точность по полосам решения, стабильность (подвыборки, PSI) и калибровка весов.

    uv run python -m validation.run            # 20 000 компаний → docs/model-validation.md
    uv run python -m validation.run --n 5000   # быстрее

У банка вместо `generate()` — история заявок с фактическим исходом; остальное не меняется.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from service.config import Policy, get_policy
from service.scoring import factor_values, stops

from .generate import generate

REPORT = Path(__file__).resolve().parents[2] / "docs" / "model-validation.md"
STOP_SCORE = -1          # стоп-фактор хуже любого балла


@dataclass
class Band:
    name: str
    title: str
    share: float
    default_rate: float
    count: int


@dataclass
class Result:
    n: int
    seed: int
    default_rate: float
    gini: float
    ks: float
    bands: list[Band]
    fold_ginis: list[float]
    psi: float
    calibrated_gini: float
    suggested_points: dict[str, int]
    current_points: dict[str, int] = field(default_factory=dict)


def gini(defaults: np.ndarray, scores: np.ndarray) -> float:
    """Gini = 2·AUC − 1; высокий балл — низкий риск, поэтому риск = −балл."""
    return round(2 * roc_auc_score(defaults, -scores) - 1, 4)


def ks(defaults: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(scores)
    d = defaults[order]
    bad = np.cumsum(d) / max(d.sum(), 1)
    good = np.cumsum(1 - d) / max((1 - d).sum(), 1)
    return round(float(np.max(np.abs(bad - good))), 4)


def psi(a: np.ndarray, b: np.ndarray, edges=(-1.5, 0, 30, 40, 50, 60, 70, 80, 90, 101)) -> float:
    pa = np.histogram(a, edges)[0] / len(a) + 1e-6
    pb = np.histogram(b, edges)[0] / len(b) + 1e-6
    return round(float(np.sum((pa - pb) * np.log(pa / pb))), 4)


def largest_remainder(weights: dict[str, float], total: int = 100) -> dict[str, int]:
    s = sum(weights.values()) or 1
    raw = {k: v / s * total for k, v in weights.items()}
    out = {k: int(v) for k, v in raw.items()}
    for k in sorted(raw, key=lambda k: raw[k] - out[k], reverse=True)[: total - sum(out.values())]:
        out[k] += 1
    return out


def validate(policy: Policy, n: int = 20_000, seed: int = 42) -> Result:
    sample = generate(n, seed)
    y = sample.defaults
    names = list(policy.factors)
    points = np.array([[factor_values(policy, a)[f][1] for f in names] for a in sample.applicants], dtype=float)
    stopped = np.array([bool(stops(policy, a)) for a in sample.applicants])
    total = np.where(stopped, STOP_SCORE, points.sum(axis=1))
    approve = policy.decision["approve_score"]
    floor = min(b["min"] for b in policy.decision["counter_bands"])

    def band(name, title, mask):
        return Band(name, title, round(float(mask.mean()), 4), round(float(y[mask].mean()) if mask.any() else 0.0, 4),
                    int(mask.sum()))

    bands = [band("APPROVE", f"{approve}+ баллов — одобрение", (total >= approve)),
             band("COUNTER", f"{floor}–{approve - 1} — иные условия", (total >= floor) & (total < approve)),
             band("REJECT", f"< {floor} или стоп-фактор — отказ", (total < floor))]

    folds = np.array_split(np.random.default_rng(seed).permutation(n), 5)
    fold_ginis = [gini(y[idx], total[idx]) for idx in folds]
    half = n // 2

    # Калибровка: логистическая регрессия на баллах факторов (без стопов) → важность фактора → новые максимумы
    train = ~stopped
    lr = LogisticRegression(max_iter=2000).fit(points[train], y[train])
    importance = {f: max(0.0, -c) * policy.factors[f]["max_points"] for f, c in zip(names, lr.coef_[0])}
    calibrated = np.where(stopped, STOP_SCORE, -lr.predict_proba(points)[:, 1])

    return Result(n=n, seed=seed, default_rate=round(float(y.mean()), 4), gini=gini(y, total), ks=ks(y, total),
                  bands=bands, fold_ginis=fold_ginis, psi=psi(total[:half], total[half:]),
                  calibrated_gini=gini(y, calibrated), suggested_points=largest_remainder(importance),
                  current_points={f: policy.factors[f]["max_points"] for f in names})


def render(policy: Policy, r: Result) -> str:
    rows_bands = "\n".join(f"| {b.title} | {b.share:.1%} | {b.default_rate:.1%} |" for b in r.bands)
    rows_points = "\n".join(
        f"| {policy.factors[f]['label']} | {r.current_points[f]} | {r.suggested_points[f]} |" for f in r.current_points)
    folds = ", ".join(f"{g:.2f}" for g in r.fold_ginis)
    return f"""# Проверка балльной карты

> Сгенерировано `uv run python -m validation.run` ({date.today():%d.%m.%Y}), политика `{policy.version}`,
> {r.n:,} синтетических компаний, seed {r.seed}. **Данные синтетические**: проверка показывает метод и согласованность
> карты, а не качество на реальных заёмщиках. Дефолт в выборке задан своей зависимостью от признаков, а не баллами
> карты, — иначе проверка была бы по кругу.

Кейс (стр. 14): рейтинговые модели «проверяются в том числе по способности различать заемщиков с разным уровнем риска,
точности и стабильности результатов». Ниже — эти три проверки и калибровка весов.

## 1. Различение заёмщиков

| Метрика | Значение | Как читать |
|---|---|---|
| Gini | **{r.gini:.2f}** | 0 — случайное угадывание, 1 — идеальное разделение; для простой балльной карты 0,4–0,6 — рабочий уровень |
| KS | {r.ks:.2f} | Максимальный разрыв накопленных долей «плохих» и «хороших» |
| Доля дефолтов в выборке | {r.default_rate:.1%} | Синтетика |

## 2. Точность по полосам решения

| Полоса | Доля заявок | Доля дефолтов |
|---|---|---|
{rows_bands}

Доля дефолтов растёт от одобрения к отказу — пороги 70 и 50 баллов разделяют риск в правильном порядке.

## 3. Стабильность

| Проверка | Значение | Норма |
|---|---|---|
| Gini на 5 подвыборках | {folds} | Разброс < 0,2 |
| PSI распределения баллов между половинами выборки | {r.psi:.3f} | < 0,1 — стабильно; 0,1–0,25 — заметный сдвиг; > 0,25 — пересмотреть карту |

## 4. Калибровка весов — как банк получит свою карту

Логистическая регрессия на баллах 9 факторов оценивает, насколько каждый фактор на самом деле связан с дефолтом,
и переводит это в максимумы баллов (сумма — 100). Gini откалиброванной модели — **{r.calibrated_gini:.2f}**
(у текущей карты — {r.gini:.2f}).

| Фактор | Сейчас | Предложено калибровкой |
|---|---|---|
{rows_points}

Текущие веса оставлены как есть: на них держатся приёмочные сценарии P1–P5 из спецификации. На реальной истории
заявок банк запускает тот же скрипт, переносит предложенные максимумы в `ml/config/policy.yaml` и получает свою карту;
маршрут к одобрению, справочник причин и объяснения работают без изменений.

## Ограничения

- Выборка синтетическая; на реальных данных нужна проверка на отложенном периоде (out-of-time) и валидация
  риск-подразделением.
- Калибровка оценена на той же выборке, на которой обучена; для решения о новых весах — отдельная тестовая выборка.
- Стоп-факторы проверяются отдельно от баллов: в метриках они считаются худшим баллом.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=20_000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    policy = get_policy()
    result = validate(policy, args.n, args.seed)
    REPORT.write_text(render(policy, result), encoding="utf-8")
    print(f"Gini {result.gini:.2f}, KS {result.ks:.2f}, PSI {result.psi:.3f}, "
          f"калибровка Gini {result.calibrated_gini:.2f} → {REPORT}")


if __name__ == "__main__":
    main()
