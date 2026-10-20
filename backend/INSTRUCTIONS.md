# Инструкция для бэкенда: соединяем фронт и ML

Цель: фронт из `frontend/` (8 экранов) перестаёт работать на заглушках и получает настоящие расчёты из `ml/`
через твой бэкенд. Файл самодостаточен — можно отдать ИИ-ассистенту целиком.

```
frontend (Vite, :5173) ──REST, camelCase──► backend (FastAPI, :8000) ──HTTP──► ml (:8001) ──► ollama (:11434, опц.)
                                                   │
                                                   ├──► моки = ml/fixtures/personas.json
                                                   └──► postgres (:5432)
```

**Три правила:**
1. Бэкенд **не считает** баллы, лимиты, платежи и причины. Это делает `ml`, ты передаёшь данные и сохраняешь ответ.
2. Фронт ходит **только** в бэкенд. В `ml` и Ollama — никогда.
3. Ответ фронту — в его типах из `frontend/src/types.ts` (camelCase). Ответы `ml` в БД храним целиком (JSONB).

---

## Шаг 0. Запустить ML и посмотреть, что он умеет

```bash
cd ml && uv sync && uv run uvicorn service.main:app --port 8001
```
Swagger: http://localhost:8001/docs. Попробуй `POST /v1/decision` с телом `ml/fixtures/personas.json → P1 → decision`:
должно вернуться `"outcome": "APPROVED"`, `"monthly_payment": 43261`.

## Шаг 1. Каркас бэкенда

- Python 3.12, FastAPI, httpx, SQLAlchemy + Alembic (или для скорости — SQLModel), Postgres 16, `uv` + `uv.lock`.
- Переменные окружения: `DATABASE_URL`, `ML_URL=http://ml:8001` (локально `http://localhost:8001`), `CORS_ORIGINS=http://localhost:5173`.
- Префикс API: `/api/v1`. CORS для фронта обязателен.
- JSON для фронта — **camelCase** (в Pydantic: `alias_generator=to_camel, populate_by_name=True`).
- В корневой `docker-compose.yml` уже есть `ml` и `ollama`; добавь `postgres` и `backend` (`depends_on: [postgres, ml]`).

## Шаг 2. Моки — из готового файла

Отдельный сервис моков на хакатоне не обязателен: загрузи `ml/fixtures/personas.json` при старте.
Ключ — ИНН персоны:

| Персона | ИНН | Что ввести во фронте, чтобы получить сценарий спецификации |
|---|---|---|
| P1 Ольга, кофейня | `631200000001` | цель «Закупить товар», 850 000 ₽, 24 мес., выручка «10–30 млн» → **одобрено** |
| P2 ООО «Полка» | `771500000002` | «Закупить товар», 3 000 000 ₽, 18 мес., «10–30 млн» → **специалист → иные условия 2 850 000** |
| P3 Тимур, автосервис | `026800000003` | «Закупить товар», 1 200 000 ₽, 24 мес., «3–10 млн» → **отказ + маршрут ~3 мес.** |
| P4 Марина, маникюр | `540600000004` | «Закупить товар», 500 000 ₽, 12 мес., «3–10 млн» → **отказ, «~8 мес., ускорить нельзя»** |
| P5 Андрей, стройматериалы | `662300000005` | «Перекрыть кассовый разрыв», 300 000 ₽, «10–30 млн» → **нужны данные → выписка → одобрено** |
| ЗСК | `770100000099` | любое → **приостановлена по 115-ФЗ** |

Блок `decision` каждой персоны содержит `company`, `account`, `owner` (это ответы ЕГРЮЛ, ФНС, ФССП, счёта, БКИ и ЗСК).
Его `request` **не используй** — сумму и срок даёт фронт; из `checks` нужна только `declared_monthly_revenue` (шаг 4). `statement_external_turnover` — то, что «прочитано» из
выписки другого банка (только P5). Неизвестный ИНН → `404`.

## Шаг 3. Хранение

Минимум для хакатона:

```sql
applications(
  id uuid pk, number text, status text, version int,
  data jsonb,              -- ApplicationData с фронта как есть
  statement_uploaded bool default false,
  info_requests int default 0,
  precheck jsonb, decision jsonb, decision_text text, route jsonb, route_text text,
  created_at timestamptz, updated_at timestamptz
)
application_events(id uuid pk, application_id uuid, from_status text, to_status text,
                   actor text, reason text, payload jsonb, at timestamptz)
```
Смена статуса и запись в `application_events` — **в одной транзакции**.

## Шаг 4. Перевод данных фронта во вход ML

Это главная функция. Поля фронта — из `frontend/src/types.ts → ApplicationData`.

```python
REVENUE_RANGES = {  # годовая выручка с FinancePage
    "до 3 млн ₽": (0, 3_000_000), "3–10 млн ₽": (3_000_000, 10_000_000),
    "10–30 млн ₽": (10_000_000, 30_000_000), "30–120 млн ₽": (30_000_000, 120_000_000),
    "больше 120 млн ₽": (120_000_000, None),
}

def product_for(goal: str) -> str:
    return "OVERDRAFT" if goal == "Перекрыть кассовый разрыв" else "WORKING_CAPITAL"

def effective_turnover(account: dict) -> list[int]:
    own = account["turnover_monthly"][-6:]
    ext = (account.get("external_turnover_monthly") or [0] * len(own))[-len(own):]
    return [o + e for o, e in zip(own, ext)]

def declared_monthly_revenue(revenue_label: str, account: dict, persona: dict) -> int:
    """Фронт спрашивает выручку диапазоном за год, а ML нужна месячная цифра «со слов клиента».
    1) Если месячная выручка персоны (persona.decision.checks.declared_monthly_revenue) попадает в выбранный
       диапазон — это и есть ответ клиента (у P3 и P5 она больше, чем проходит через счёт, — на этом держатся
       их сценарии: маршрут P3 до 1,1 млн и «Нужны данные» у P5).
    2) Иначе — оборот по счёту, если он в диапазоне; иначе ближайшая граница диапазона / 12."""
    lo, hi = REVENUE_RANGES[revenue_label]
    in_range = lambda monthly: monthly * 12 >= lo and (hi is None or monthly * 12 <= hi)
    said = persona["decision"]["checks"].get("declared_monthly_revenue")
    if said and in_range(said):
        return said
    t = effective_turnover(account); avg = sum(t) / len(t)
    if in_range(avg):
        return round(avg)
    return round((lo if avg * 12 < lo else hi) / 12)

def build_applicant(app, persona: dict, stage: str) -> dict:
    """stage: PRECHECK (до подачи, без БКИ и ЗСК) или DECISION (после подачи)."""
    d = app.data                      # ApplicationData
    company = dict(persona["decision"]["company"])
    account = dict(persona["decision"]["account"])
    if app.statement_uploaded:
        account["external_turnover_monthly"] = persona["statement_external_turnover"]
    product = product_for(d["goal"])
    if stage == "PRECHECK":
        company.pop("zsk_level", None)                       # ЗСК известен только после подачи
        owner = {"source": "SELF_REPORTED",
                 "personal_monthly_payments": d["loanPayment"] if d["hasLoans"] == "Да" else 0}
    else:
        owner = dict(persona["decision"]["owner"])           # мок БКИ, source = BKI
    return {
        "request": {"product": product, "amount": d["amount"],
                    "term_months": None if product == "OVERDRAFT" else d["term"],
                    "has_guarantor": company["legal_form"] == "OOO"},   # у ООО владелец = поручитель
        "company": company,
        "account": account,
        "owner": owner,
        "checks": {"declared_monthly_revenue": declared_monthly_revenue(d["revenue"], account, persona),
                   "missing_documents": [],                  # клиенты с РКО: обязательных документов нет
                   "mismatch_unresolved": app.info_requests >= 1 and not app.statement_uploaded,
                   "disputed": False},
    }
```
`collateral` (залог) в ML не передаётся — в модели его нет.

## Шаг 5. Клиент ML

```python
async def ml_post(path: str, body: dict, timeout: float = 5.0, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            r = await http.post(f"{ML_URL}{path}", json=body, timeout=timeout)
            if r.status_code < 500:
                r.raise_for_status(); return r.json()
        except httpx.TransportError:
            pass
        await asyncio.sleep(0.5 * 2 ** attempt)
    raise MLUnavailable(path)
```
`/v1/explain` с LLM вызывай с `timeout=20` и **только в фоне** (воркер), не в запросе фронта.
Если LLM не ответил, `ml` сам вернёт шаблонный текст — это нормально.

## Шаг 6. Эндпоинты для фронта

| # | Метод и путь | Тело | Что делаешь | Ответ фронту |
|---|---|---|---|---|
| 1 | `GET /companies/{inn}` | — | ищешь персону | `{inn, name, legalForm, okved, regDate, head, address, avgMonthlyTurnover, demoRequest}` или `404`. `demoRequest` — суммы из таблицы шага 2, чтобы ведущий демо не ошибся |
| 2 | `POST /quote` | `{goal, amount, term}` | `ml POST /v1/quote {product, amount, term_months}` | `{monthly, total, fullCost, termMonths, schedule}` — `monthly = monthly_payment`, `total = total_paid` |
| 3 | `POST /applications` | `ApplicationData` | создаёшь `DRAFT` | `{applicationId, number, status}` |
| 4 | `PUT /applications/{id}` | `ApplicationData` | сохраняешь черновик (только в `DRAFT`) | `{applicationId, version}` |
| 5 | `POST /applications/{id}/precheck` | — | `build_applicant(PRECHECK)` → `ml /v1/precheck` → `ml /v1/explain {precheck, use_llm: false}` | `{goalOffers, precheck}` (шаг 7) |
| 6 | `POST /applications/{id}/documents` | multipart `file`, `docId` | сохраняешь файл; если заявка в `INFO_REQUESTED` и ИНН = P5 → `statement_uploaded = true`, статус `IN_REVIEW`, перезапуск воркера | `{docs}` |
| 7 | `POST /applications/{id}/submit` | — | проверяешь `consent1 && consent2` (иначе `400`); `DRAFT → SUBMITTED`; запускаешь воркер (шаг 8) | `{status, outcome: "review"}` |
| 8 | `GET /applications/{id}` | — | читаешь из БД | **ApplicationView** (шаг 7) |
| 9 | `POST /applications/{id}/route` | — | `build_applicant(DECISION)` → `ml /v1/route {applicant}` → `ml /v1/explain {route}` | **RouteView** |
| 10 | `POST /applications/{id}/route/recalculate` | `{doneSteps: ["S_TAX","O_DEBT"]}` | `ml /v1/route {applicant, assume_done: doneSteps}` — без новой заявки и без БКИ | **RouteView** |
| 11 | `POST /applications/{id}/accept` · `/decline` · `/sign` | `accept` может нести `{amount, term}` в пределах предложения | статусы (шаг 8) | `{status, outcome}` |
| 12 | `GET /bank/queue` · `GET /bank/applications/{id}` · `POST /bank/applications/{id}/decision` | решение: `{outcome, amount, term, reasonCode, comment}` | кабинет специалиста (фронт сделает позже). `reasonCode` — только из `ml GET /v1/reasons`; после решения с отказом — `ml /v1/route` с `specialist_decision` | — |

## Шаг 7. Перевод ответов ML в типы фронта

**`goalOffers: LoanOffer[]`** (тип `LoanOffer` из `types.ts`) — из `precheck.offers`, максимум 3:

```python
CHANCE_DOTS = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
NAMES = {"WORKING_CAPITAL": "Деньги на текущие расходы", "OVERDRAFT": "Овердрафт"}

def to_loan_offer(o: dict, precheck: dict) -> dict:
    c = o["cost"]
    if o["product"] == "OVERDRAFT":
        amount = f"Лимит до {rub(o['amount'])}"
        detail = f"Проценты при полном использовании около {rub(c['monthly_payment'])} в месяц · установка лимита {rub(c['fee'])}"
    else:
        amount = f"{rub(o['amount'])} на {o['term_months']} месяцев"
        detail = f"Платеж около {rub(c['monthly_payment'])} в месяц · полная стоимость {rub(c['full_cost'])}"
    why = precheck["reasons"][0]["text"] if precheck["reasons"] else "Подходит под вашу цель и оборот"
    return {"name": NAMES[o["product"]], "amount": amount, "detail": detail, "why": why,
            "chance": CHANCE_DOTS[precheck["chance"]]}
```
Если `offers` пуст (стоп-фактор, например P3), верни одну карточку с запрошенной суммой и `chance: 1` — фронт покажет
низкий шанс, а `precheck.reasons` объяснят почему.

**`precheck`** (новое поле для фронта): `{chance, amountLow, amountHigh, reasons: [text], text, disclaimer, ownerNote}` из
`amount_range.low/high`, `reasons[].text`, текста `/v1/explain`, `disclaimer`, `owner_note`.

**ApplicationView** — ответ `GET /applications/{id}`:
```json
{ "applicationId": "uuid", "number": "A-000123", "status": "COUNTER_OFFER", "outcome": "partial",
  "timeline": [ {"title": "Заявка принята", "state": "done", "at": "14:02"},
                {"title": "Проверяем данные", "state": "done", "at": "14:02"},
                {"title": "Оцениваем заявку", "state": "done", "at": "14:03"},
                {"title": "Решение", "state": "done", "at": "14:03"} ],
  "decisionAmount": 2850000, "decisionTerm": 18, "decisionMonthly": 184575, "decisionFullCost": 500852,
  "decisionText": "Вы хотели 3 000 000 ₽ — банк может предложить 2 850 000 ₽ на 18 мес. …",
  "reasons": ["Сумму ограничивает оборот, а не баллы", "Поступления на счёт нерегулярны"],
  "nextAction": "Посмотрите предложение банка", "routeAvailable": false }
```

**`outcome` для фронта** (тип `Outcome`):

| Статус | `outcome` |
|---|---|
| `DRAFT`, `SUBMITTED`, `IN_REVIEW`, `SPECIALIST_REVIEW` | `review` |
| `APPROVED`, `OFFER_ACCEPTED`, `SIGNED`, `DISBURSED` | `approved` |
| `COUNTER_OFFER` | `partial` |
| `REJECTED`, `DECLINED_BY_CLIENT` | `rejected` (`routeAvailable: true`) |
| `INFO_REQUESTED` | `info` — **фронту добавить** |
| `SUSPENDED_115FZ` | `suspended` — **фронту добавить**; `routeAvailable: false`, текст только из `decisionText` |

**RouteView**: `{status, steps: [{code, action, term, pointsGain, done}], horizonText, message, disclaimer, advice,
projectedAmount, text}` — из `route.steps[]`, `horizon_text`, `message`, `disclaimer`, `advice`,
`projection.available_amount`, текста `/v1/explain`.

## Шаг 8. Воркер и статусы

После `submit` запусти фоновую задачу (FastAPI `BackgroundTasks` или asyncio-таск; для надёжности — таблица `jobs`):

```
SUBMITTED ─► IN_REVIEW
   пауза ~1,5 с между этапами — чтобы лента на StatusPage двигалась на демо
   Б1+Б2: «Проверяем данные»   Б3: «Оцениваем заявку»
   decision = ml /v1/decision (build_applicant DECISION)
   если ml недоступен после ретраев → SPECIALIST_REVIEW (причина ML_UNAVAILABLE)
   статус:
     outcome SUSPENDED_115FZ              → SUSPENDED_115FZ
     outcome INFO_REQUESTED               → INFO_REQUESTED, info_requests += 1, nextAction «Загрузите выписку другого банка за 6 месяцев»
     specialist.required == true          → SPECIALIST_REVIEW (рекомендация = outcome)
     иначе                                → APPROVED / COUNTER_OFFER / REJECTED
   decision_text = ml /v1/explain {decision, use_llm: true}   (фоном, timeout 20 с)
   если REJECTED → сразу построй маршрут (эндпоинт 9) и сохрани
```

Остальные переходы:

| Из | Действие | В |
|---|---|---|
| `INFO_REQUESTED` | клиент загрузил выписку | `IN_REVIEW` (воркер заново) |
| `SPECIALIST_REVIEW` | решение специалиста | `APPROVED` / `COUNTER_OFFER` / `INFO_REQUESTED` / `REJECTED` |
| `APPROVED`, `COUNTER_OFFER` | `accept` | `OFFER_ACCEPTED` |
| `COUNTER_OFFER` | `decline` | `DECLINED_BY_CLIENT` (+ маршрут) |
| `OFFER_ACCEPTED` | `sign` | `SIGNED` → сразу `DISBURSED` |
| `SUBMITTED` … `SPECIALIST_REVIEW` | отзыв | `WITHDRAWN` |

Всё остальное → `409 INVALID_TRANSITION`. P2 сам попадёт в `SPECIALIST_REVIEW` (сумма > 2 млн): пока кабинета специалиста
на фронте нет, сделай `POST /bank/applications/{id}/decision` вызываемым из Swagger — так демо пройдёт.

## Шаг 9. Что поменять во фронте (подсказать фронтендеру)

1. `src/api.ts`: `const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"`.
2. `App.tsx`: `monthly`/`total` — из `POST /quote` (debounce 300 мс) вместо формулы с 22%;
   `goalOffers` — из `POST /precheck`; `submit` → `POST /submit`.
3. `CompanyPage.tsx`: «Найти компанию» → `GET /companies/{inn}` вместо «ООО «Ромашка Трейд»».
4. `FinancePage.tsx` → «Показать предложения»: `PUT /applications/{id}`, затем `POST /precheck`.
5. `StatusPage.tsx`: опрос `GET /applications/{id}` раз в 3 с; убрать демо-кнопки исходов, `amount * 0.7`,
   «600 000 ₽» и фразу «Обычно отвечаем в течение рабочего дня»; показывать `decisionText`, `decisionAmount`, `reasons`,
   маршрут из RouteView.
6. `types.ts`: в `Outcome` добавить `"info" | "suspended"`; в `ApplicationData` — `applicationId`.

## Шаг 10. Готово, когда

Прогон через фронт:

| Персона | Ожидаемо |
|---|---|
| P1 | 8 экранов, `approved`, `decisionMonthly = 43261`, `decisionFullCost = 196774` |
| P2 | `review` (у специалиста) → решение через Swagger → `partial`, `decisionAmount = 2850000`, `decisionMonthly = 184575` |
| P3 | на предложениях `chance = 1`; после отправки `rejected`; маршрут: «Погасить сальдо ЕНС» → «Закрыть кредитки» (+8) → «Вся выручка через один счёт» (+12), `horizonText = "~3 мес."` |
| P4 | `rejected`, `horizonText = "~8 мес., ускорить нельзя"` |
| P5 | `info` → загрузить файл → `approved`, 300 000 ₽ |
| ЗСК | `suspended`, маршрута нет |

Плюс автотесты на эти сценарии (pytest + httpx, `ml` поднят в compose). Эти ожидания проверены прогоном функций
шага 4 через `ml` на данных из таблицы шага 2 — если цифры не сходятся, ошибка в переводе данных, а не в ML.
