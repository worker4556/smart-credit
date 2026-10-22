"""Сквозная проверка API на всех демо-персонажах: вход → черновик → предоценка → подача → решение → маршрут.

Запуск (стек поднят через docker compose):
    python3 scripts/smoke_api.py                      # через nginx фронта, http://localhost:3000/api/v1
    python3 scripts/smoke_api.py http://localhost:8000/api/v1
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000/api/v1"

# Данные заявки как их заполнит клиент (совпадают с frontend/src/data/demoAccounts.ts)
PERSONAS = {
    "p1": dict(goal="Закупить товар или материалы", amount=850_000, term=24, monthlyRevenue=950_000, hasLoans="Да", loanPayment=20_000, hadOverdue2y=False),
    "p2": dict(goal="Закупить товар или материалы", amount=3_000_000, term=18, monthlyRevenue=1_900_000, hasLoans="Да", loanPayment=50_000, hadOverdue2y=False),
    "p3": dict(goal="Закупить товар или материалы", amount=1_200_000, term=24, monthlyRevenue=750_000, hasLoans="Да", loanPayment=25_000, hadOverdue2y=True),
    "p4": dict(goal="Закупить товар или материалы", amount=500_000, term=12, monthlyRevenue=400_000, hasLoans="Да", loanPayment=10_000, hadOverdue2y=False),
    "p5": dict(goal="Перекрыть кассовый разрыв", amount=300_000, term=12, monthlyRevenue=900_000, hasLoans="Да", loanPayment=20_000, hadOverdue2y=False),
    "zsk": dict(goal="Закупить товар или материалы", amount=1_000_000, term=12, monthlyRevenue=1_500_000, hasLoans="Нет", loanPayment=0, hadOverdue2y=False),
}


def call(method: str, path: str, token: str | None = None, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(errors="replace")


def run(login: str, form: dict) -> bool:
    status, auth = call("POST", "/auth/login", body={"login": login, "password": "demo"})
    if status != 200:
        print(f"  ✗ вход {status}: {auth}")
        return False
    token = auth["accessToken"]
    company = auth["user"]["company"]
    data = {**form, "collateral": "", "consent1": True, "consent2": True, "docs": {}}

    status, app = call("POST", "/applications", token, data)
    if status not in (200, 201):
        print(f"  ✗ черновик {status}: {app}")
        return False
    app_id = app["applicationId"]

    status, pre = call("POST", f"/applications/{app_id}/precheck", token)
    if status != 200:
        print(f"  ✗ предоценка {status}: {pre}")
        return False
    offers = ", ".join(f"{o.get('kind')}:{o['amount']:,}".replace(",", " ") for o in pre["goalOffers"])
    print(f"  предоценка: шанс {pre['chance']}, диапазон {pre['amountLow']:,}–{pre['amountHigh']:,}; варианты [{offers}]".replace(",", " "))

    status, app = call("POST", f"/applications/{app_id}/submit", token, data)
    if status != 200:
        print(f"  ✗ подача {status}: {app}")
        return False

    for _ in range(30):
        status, app = call("GET", f"/applications/{app_id}", token)
        if app["outcome"] not in ("review",):
            break
        time.sleep(1)
    print(f"  решение: {app['status']} ({app['outcome']}), сумма {app.get('decisionAmount')}")

    if app["outcome"] in ("rejected", "partial"):
        status, route = call("POST", f"/applications/{app_id}/route", token)
        if status != 200:
            print(f"  ✗ маршрут {status}: {route}")
            return False
        steps = "; ".join(f"{s['code']} ({s['term']})" for s in route["steps"]) or "—"
        print(f"  маршрут: {route['status']}, {route['horizonText']}; шаги: {steps}")
    print(f"  ✓ {company['name']} · ИНН {company['inn']}")
    return True


def main() -> int:
    ok = True
    for login, form in PERSONAS.items():
        print(f"\n[{login}]")
        ok = run(login, form) and ok
    print("\nИТОГ:", "всё прошло" if ok else "есть ошибки")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
