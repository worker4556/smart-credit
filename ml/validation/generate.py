"""Синтетическая выборка малого бизнеса с исходом «дефолт / не дефолт».

Дефолт задаётся СВОЕЙ зависимостью от признаков (логистическая модель со своими коэффициентами и шумом), а не баллами
карты — иначе проверка была бы по кругу. Направления влияния взяты из кейса (стр. 14): стабильность оборотов и чистая
история снижают риск, долговая нагрузка, нестабильность и просрочки повышают. Это демо-допущения, не данные банка.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from service.schemas import Applicant

OKVED = {"LOW": ["56.10"], "MEDIUM": ["47.91", "45.20", "96.02", "47.52"], "HIGH": ["41.20", "68.10"]}
INDUSTRY_RISK = {"LOW": -0.3, "MEDIUM": 0.0, "HIGH": 0.6}
TERMS = [6, 12, 18, 24, 36]


@dataclass
class Sample:
    applicants: list[Applicant]
    defaults: np.ndarray        # 1 — дефолт за горизонт, 0 — нет


def generate(n: int, seed: int = 42) -> Sample:
    rng = np.random.default_rng(seed)
    level = np.exp(rng.normal(np.log(800_000), 0.6, n))
    cv = 0.05 + 0.5 * rng.beta(1.5, 4, n)
    age = np.minimum(3 + rng.gamma(2, 15, n), 120).astype(int)
    rko = np.minimum(age, 3 + rng.gamma(2, 10, n)).astype(int)
    debt_ratio = np.where(rng.random(n) < 0.5, 0.0, rng.uniform(0.02, 0.35, n))
    amount = np.maximum(100_000, np.round(level * rng.uniform(0.3, 3.5, n) / 50_000) * 50_000).astype(int)
    group = rng.choice(["LOW", "MEDIUM", "HIGH"], n, p=[0.3, 0.55, 0.15])
    fssp = np.where(rng.random(n) < 0.12, rng.uniform(5_000, 200_000, n), 0).astype(int)
    tax = np.where(rng.random(n) < 0.06, rng.uniform(10_000, 150_000, n), 0).astype(int)
    dpd = rng.choice([0, 15, 45, 95], n, p=[0.75, 0.12, 0.08, 0.05])
    since90 = np.where(dpd == 95, rng.integers(0, 24, n), -1)
    personal = rng.uniform(0, 0.25, n)
    card = rng.beta(2, 3, n)
    bankrupt = rng.random(n) < 0.005
    lawsuit = rng.random(n) < 0.01

    logit = (-5.0 + 2.2 * cv + 3.0 * debt_ratio + 1.2 * np.exp(-age / 18) + 0.35 * np.log(amount / level)
             + np.vectorize(INDUSTRY_RISK.get)(group) + 0.8 * (fssp > 0) + 0.5 * (rko < 6)
             + np.select([dpd == 15, dpd == 45, dpd == 95], [0.5, 1.0, 1.8], 0.0)
             + 2.5 * personal + 0.6 * (card > 0.5) + 1.2 * (tax > 500) + 3.0 * bankrupt + 1.5 * lawsuit
             + rng.normal(0, 0.6, n))
    defaults = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)

    applicants = []
    for i in range(n):
        z = rng.normal(0, 1, 6)
        z = (z - z.mean()) / (z.std() or 1)
        series = np.maximum(1_000, level[i] * (1 + cv[i] * z)).round().astype(int).tolist()
        applicants.append(Applicant(**{
            "request": {"product": "WORKING_CAPITAL", "amount": int(amount[i]), "term_months": int(rng.choice(TERMS))},
            "company": {"legal_form": "IP", "okved": str(rng.choice(OKVED[group[i]])), "business_age_months": int(age[i]),
                        "tax_debt": int(tax[i]), "bankruptcy": bool(bankrupt[i]), "recovery_lawsuit": bool(lawsuit[i]),
                        "fssp_debt": int(fssp[i]), "zsk_level": "GREEN"},
            "account": {"turnover_monthly": series, "rko_months": int(rko[i]),
                        "business_monthly_payments": int(debt_ratio[i] * level[i]),
                        "business_debt": int(debt_ratio[i] * level[i] * 18)},
            "owner": {"source": "BKI", "max_dpd_24m": int(dpd[i]),
                      "months_since_90plus": int(since90[i]) if since90[i] >= 0 else None,
                      "personal_monthly_payments": int(personal[i] * level[i]), "card_utilization": float(card[i])},
            "checks": {"declared_monthly_revenue": int(level[i])},
        }))
    return Sample(applicants=applicants, defaults=defaults)
