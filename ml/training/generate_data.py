"""Генератор синтетического датасета заёмщиков МСБ.

Данные полностью вымышлены. «Истинный» риск дефолта задаётся известной
логистической зависимостью от признаков + шум, поэтому модель обязана
восстановить разумные направления влияния — это проверяется тестами.

Запуск: uv run python -m training.generate_data --rows 40000
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from service.features import PRODUCT_BASE_RATES, HIGH_RISK_OKVED, LOW_RISK_OKVED

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

OKVED_POOL = {
    "LOW": ["62.01", "63.11", "69.20", "71.12", "85.41", "86.21"],
    "MEDIUM": ["46.90", "47.19", "49.41", "10.71", "25.62", "45.20", "52.29"],
    "HIGH": ["41.20", "43.21", "55.10", "56.10", "68.20"],
}
assert {o[:2] for o in OKVED_POOL["HIGH"]} <= HIGH_RISK_OKVED
assert {o[:2] for o in OKVED_POOL["LOW"]} <= LOW_RISK_OKVED


def generate(rows: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n = rows

    legal_form = np.where(rng.random(n) < 0.55, "IP", "OOO")
    is_ip = legal_form == "IP"
    age = np.clip(np.exp(rng.normal(3.4, 0.9, n)), 1, 300).astype(int)

    revenue = np.exp(rng.normal(np.where(is_ip, np.log(8e6), np.log(25e6)), 0.9))
    revenue = np.clip(revenue, 6e5, 8e8).round(-4).astype(int)

    group = rng.choice(["LOW", "MEDIUM", "HIGH"], n, p=[0.2, 0.5, 0.3])
    okved = np.array([rng.choice(OKVED_POOL[g]) for g in group])

    product = rng.choice(list(PRODUCT_BASE_RATES), n, p=[0.4, 0.25, 0.2, 0.15])
    term = rng.choice([6, 12, 24, 36, 48, 60], n, p=[0.05, 0.25, 0.25, 0.25, 0.12, 0.08])
    amount = np.clip(revenue * np.exp(rng.normal(np.log(0.18), 0.7, n)), 1e5, 3e7).round(-4).astype(int)
    rate = np.array([PRODUCT_BASE_RATES[p] for p in product]) + rng.uniform(0, 5, n)

    loans = np.clip(rng.poisson(1.0, n), 0, 6)
    existing = (loans * revenue / 12 * rng.uniform(0.02, 0.09, n)).round(-2).astype(int)

    dpd_bucket = rng.choice(4, n, p=[0.8, 0.12, 0.05, 0.03])
    dpd = np.select(
        [dpd_bucket == 0, dpd_bucket == 1, dpd_bucket == 2],
        [0, rng.integers(1, 31, n), rng.integers(31, 90, n)],
        rng.integers(90, 200, n),
    )
    overdue_cnt = np.where(dpd > 0, 1 + rng.poisson(np.where(dpd > 30, 1.5, 0.4)), 0)

    tax_debt = np.where(rng.random(n) < 0.08, np.exp(rng.normal(np.log(150_000), 1.0, n)), 0).round(-3).astype(int)
    mass_address = rng.random(n) < 0.04
    revenue_confirmed = rng.random(n) < 0.4

    # «Истинная» модель риска
    r_m = rate / 100 / 12
    payment = amount * r_m / (1 - (1 + r_m) ** -term)
    debt_burden = (existing + payment) / (revenue / 12)
    a2r = amount / revenue

    logit = (
        -3.3
        + np.select([age < 6, age < 12, age < 24, age >= 48], [1.0, 0.6, 0.25, -0.45], 0.0)
        + 2.4 * np.clip(debt_burden - 0.25, -0.2, 1.0)
        + np.where(a2r > 0.5, 0.5, 0.0)
        + np.select([dpd >= 90, dpd > 30, dpd > 0], [2.6, 1.5, 0.7], 0.0)
        + 0.25 * np.minimum(overdue_cnt, 4)
        + np.where(loans >= 3, 0.4, np.where(loans == 0, 0.1, 0.0))
        + np.where(tax_debt > 0, 0.8, 0.0)
        + np.where(mass_address, 0.9, 0.0)
        + np.where(revenue_confirmed, -0.35, 0.0)
        + np.select([group == "HIGH", group == "LOW"], [0.4, -0.3], 0.0)
        + np.where(is_ip, 0.15, 0.0)
        + rng.normal(0, 0.35, n)
    )
    default = rng.random(n) < 1 / (1 + np.exp(-logit))

    return pd.DataFrame({
        "legal_form": legal_form,
        "okved": okved,
        "company_age_months": age,
        "annual_revenue": revenue,
        "revenue_confirmed": revenue_confirmed,
        "requested_amount": amount,
        "term_months": term,
        "product_code": product,
        "annual_rate": rate.round(2),
        "active_loans_count": loans,
        "existing_monthly_payments": existing,
        "max_dpd_12m": dpd,
        "overdue_count_12m": overdue_cnt,
        "tax_debt": tax_debt,
        "mass_address": mass_address,
        "default_12m": default.astype(int),
    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=40_000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    df = generate(args.rows, args.seed)
    DATA_DIR.mkdir(exist_ok=True)
    out = DATA_DIR / "synthetic_sme.csv"
    df.to_csv(out, index=False)
    print(f"{len(df)} rows, default rate {df.default_12m.mean():.2%} → {out}")


if __name__ == "__main__":
    main()
