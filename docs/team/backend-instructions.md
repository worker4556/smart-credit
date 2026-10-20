# Инструкция для бэкенда: соединяем фронт и ML

> Рабочие материалы команды, не часть сдачи. Для проверки — корневой README, раздел «Для жюри».

Цель: фронт из `frontend/` (8 экранов) перестаёт работать на заглушках и получает настоящие расчёты из `ml/`
через твой бэкенд, а весь проект запускается одной командой. Файл самодостаточен — можно отдать ИИ-ассистенту целиком.

```
браузер ──► localhost:3000  nginx: собранный фронт + прокси /api ──► backend :8000 ──► ml :8001 ──► ollama :11434 (LLM, включена по умолчанию)
                                                                        ├──► моки = ml/fixtures/personas.json
                                                                        └──► postgres :5432
```

**Четыре правила:**
1. Бэкенд **не считает** баллы, лимиты, платежи и причины. Это делает `ml`, ты передаёшь данные и сохраняешь ответ.
2. Фронт ходит **только** в бэкенд. В `ml` и Ollama — никогда.
3. **Персона = учётная запись.** Компания и ИНН берутся из аккаунта, а не из того, что набрали в поле. Чужие данные — `403`.
4. Ответ фронту — в его типах из `frontend/src/types.ts` (camelCase). Ответы `ml` в БД храним целиком (JSONB).

---

## Шаг 0. Запустить ML и посмотреть, что он умеет

```bash
cd ml && uv sync && uv run uvicorn service.main:app --port 8001
```
Swagger: http://localhost:8001/docs. Попробуй `POST /v1/decision` с телом `ml/fixtures/personas.json → P1 → decision`:
должно вернуться `"outcome": "APPROVED"`, `"monthly_payment": 43261`.

## Шаг 1. Каркас бэкенда

- Python 3.12, FastAPI, httpx, SQLAlchemy + Alembic (или для скорости — SQLModel), Postgres 16, `uv` + `uv.lock`.
- Переменные окружения: `DATABASE_URL`, `ML_URL=http://ml:8001`, `JWT_SECRET`, `CORS_ORIGINS=http://localhost:5173`
  (CORS нужен только для `npm run dev`; в сборке фронт и API на одном адресе через nginx).
- Префикс API: `/api/v1`. JSON для фронта — **camelCase** (Pydantic: `alias_generator=to_camel, populate_by_name=True`).
- При старте контейнер сам выполняет `alembic upgrade head` и загружает демо-данные (шаг 2), если их ещё нет.

## Шаг 2. Учётные записи и демо-данные

Регистрации нет (так в спецификации). При старте создай пользователей и их компании. Вход — **логин и пароль**
(у всех демо-учёток пароль `demo`, храни хэш). Кнопок с персонами на экране нет: логины для жюри — в README.
У каждой клиентской учётной записи ровно одна компания и свой ИНН.
Данные внешних систем для компании — блок `decision` персоны из `ml/fixtures/personas.json`.

| Логин | Роль | Компания (ИНН) | Что сделать во фронте, чтобы получить сценарий спецификации |
|---|---|---|---|
| `p1` | CLIENT | ИП Ольга, кофейня (`631200000001`) | цель «Закупить товар», 850 000 ₽, 24 мес., выручка «10–30 млн» → **одобрено** |
| `p2` | CLIENT | ООО «Полка» (`771500000002`) | «Закупить товар», 3 000 000 ₽, 18 мес., «10–30 млн» → **специалист → иные условия 2 850 000** |
| `p3` | CLIENT | ИП Тимур, автосервис (`026800000003`) | «Закупить товар», 1 200 000 ₽, 24 мес., «3–10 млн» → **отказ + маршрут ~3 мес.** |
| `p4` | CLIENT | ИП Марина, маникюр (`540600000004`) | «Закупить товар», 500 000 ₽, 12 мес., «3–10 млн» → **отказ, «~8 мес., ускорить нельзя»** |
| `p5` | CLIENT | ИП Андрей, стройматериалы (`662300000005`) | «Перекрыть кассовый разрыв», 300 000 ₽, «10–30 млн» → **нужны данные → выписка → одобрено** |
| `zsk` | CLIENT | ООО с «красным» ЗСК (`770100000099`) | любое → **приостановлена по 115-ФЗ** |
| `specialist` | SPECIALIST | — | кабинет специалиста |
| `admin` | ADMIN | — | пульт демо |

- В блоке `decision` персоны лежат `company`, `account`, `owner` — это ответы ЕГРЮЛ, ФНС, ФССП, счёта в Альфе, БКИ и ЗСК.
- Его `request` **не используй**: сумму и срок даёт фронт. Из `checks` нужна только `declared_monthly_revenue` (шаг 4).
- `statement_external_turnover` — то, что «прочитано» из выписки другого банка. Есть только у P5.
- Название, руководитель и адрес для карточки компании — в персонах их нет. Заведи в сидах, например «ИП Смирнова Ольга
  Викторовна, кофейня, г. Самара».

## Шаг 3. Хранение

```sql
users(id uuid pk, login text unique, password_hash text, role text, display_name text)
companies(id uuid pk, user_id uuid, inn text unique, name text, head text, address text,
          persona_key text)          -- ключ в ml/fixtures/personas.json: P1…P5, ZSK
applications(
  id uuid pk, number text, company_id uuid, status text, version int,
  data jsonb,                        -- ApplicationData с фронта как есть
  statement_uploaded bool default false, info_requests int default 0,
  precheck jsonb, decision jsonb, decision_text text, decided_by text, reason_code text, comment text,
  route jsonb, route_text text, created_at timestamptz, updated_at timestamptz)
application_events(id uuid pk, application_id uuid, from_status text, to_status text,
                   actor text, reason text, payload jsonb, at timestamptz)
```
Смена статуса и запись в `application_events` — **в одной транзакции**.
Каждый запрос к `/applications/{id}` проверяет, что заявка принадлежит компании текущего пользователя, иначе `403`.

## Шаг 4. Перевод данных фронта во вход ML

Главная функция. Поля фронта — из `frontend/src/types.ts → ApplicationData`. `persona` — запись из
`personas.json` по `companies.persona_key` компании **текущего пользователя** (не по `data.inn`).

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
Таймауты — одни для ML и бэкенда (LLM на процессоре отвечает до 30 с, у бэкенда запас):

| Вызов `ml` | Таймаут бэкенда | Когда |
|---|---|---|
| `/v1/explain` (`use_llm: true`) | `timeout=40` | **только в фоне** (воркер) в момент решения; текст сохраняй |
| `/v1/assistant` (`use_llm: true`) | `timeout=40` | клиент ждёт; перед ним — быстрый вызов с `use_llm: false` |
| `/v1/intent` | `timeout=20` с | клиент ждёт |
| остальные (без LLM) | `timeout=5`, до 3 повторов | — |

Если LLM не ответил или ещё не скачалась (`GET /health` → `llm.ready = false`), `ml` сам вернёт шаблонный текст — это нормально.

**Что `ml` проверяет сам и как на это реагировать:**
- Срок вне диапазона продукта или сумма ниже минимума → `ml` отвечает `422` с понятным текстом в `detail[0].msg`.
  Отдай фронту `400 VALIDATION_ERROR` с этим текстом. Диапазоны: кредит — от 100 000 ₽, 3–36 мес.;
  овердрафт — от 50 000 ₽, **срок не передавать** (`term_months: null`, он всегда 12).
- Иные условия при 50–69 баллах идут **с надбавкой к ставке** (+2 или +4 п.п.) — ставка приходит в `cost.rate`,
  не подставляй базовую.
- «Нужны данные» по выручке — только если клиент заявил **больше**, чем видно по счёту, более чем на 30%.

## Шаг 6. Эндпоинты

Все, кроме входа, требуют `Authorization: Bearer <jwt>`. Роль проверяется на каждом эндпоинте.

**Вход**

| Метод и путь | Тело | Ответ |
|---|---|---|
| `POST /auth/login` | `{login, password}` | `{token, role, displayName}`; неверная пара → `401` «Неверный логин или пароль» |
| `GET /me` | — | `{login, role, displayName, company: {inn, name, legalForm, okved, regDate, head, address, avgMonthlyTurnover}}` — **отсюда фронт подставляет ИНН и карточку компании** |

**Клиент (роль CLIENT)**

| # | Метод и путь | Тело | Что делаешь | Ответ фронту |
|---|---|---|---|---|
| 1 | `GET /companies/{inn}` | — | Только компания текущего пользователя. Чужой или неизвестный ИНН → `404` «Компания не найдена среди ваших» | как `company` в `/me` |
| 2 | `POST /quote` | `{goal, amount, term}` | `ml POST /v1/quote {product, amount, term_months}` | `{monthly, total, fullCost, termMonths, schedule}` (`monthly = monthly_payment`, `total = total_paid`) |
| 3 | `POST /applications` | `ApplicationData` | создаёшь `DRAFT` от компании пользователя; если `data.inn` не её — `403` | `{applicationId, number, status}` |
| 4 | `PUT /applications/{id}` | `ApplicationData` | сохраняешь черновик (только в `DRAFT`) | `{applicationId, version}` |
| 5 | `POST /applications/{id}/precheck` | — | `build_applicant(PRECHECK)` → `ml /v1/precheck` → `ml /v1/explain {precheck, use_llm: false}` | `{goalOffers, precheck}` (шаг 7) |
| 6 | `POST /applications/{id}/documents` | multipart `file`, `docId` | Сохраняешь файл. Если заявка в `INFO_REQUESTED` и у персоны есть `statement_external_turnover` → `statement_uploaded = true`, статус `IN_REVIEW`, перезапуск воркера | `{docs}` |
| 7 | `POST /applications/{id}/submit` | — | проверяешь `consent1 && consent2` (иначе `400`); `DRAFT → SUBMITTED`; запускаешь воркер (шаг 8) | `{status, outcome: "review"}` |
| 8 | `GET /applications` · `GET /applications/{id}` | — | только свои | список · **ApplicationView** (шаг 7) |
| 9 | `POST /applications/{id}/route` | — | `build_applicant(DECISION)` → `ml /v1/route {applicant, specialist_decision?}` → `ml /v1/explain {route}`. Если решение принял специалист, передай `specialist_decision: {outcome, reason_code, amount}` | **RouteView** |
| 10 | `POST /applications/{id}/route/recalculate` | `{doneSteps: ["S_TAX","O_DEBT"]}` | `ml /v1/route {applicant, assume_done: doneSteps}` — без новой заявки и без БКИ | **RouteView** |
| 11 | `POST /applications/{id}/accept` · `/decline` · `/sign` · `/withdraw` | `accept` может нести `{amount, term}` в пределах предложения | статусы (шаг 8) | `{status, outcome}` |
| 12 | `POST /applications/{id}/assistant` | `{question, useLlm}` | Помощник на экранах отказа, иных условий и «Нужны данные». Сам подставь сохранённые решение и маршрут: `ml POST /v1/assistant {question, context: {decision, route}, use_llm}` | `{answer, source, topic, terms}` |
| 13 | `GET /glossary` · `GET /glossary/{term}` | — | проксируешь `ml GET /v1/glossary`; неизвестный термин → `404` | словарь простых слов |

**Специалист (роль SPECIALIST)**

| Метод и путь | Что делаешь |
|---|---|
| `GET /bank/queue` | Заявки в `SPECIALIST_REVIEW`: номер, компания, сумма, причина попадания (`decision.specialist.triggers`), сколько ждёт; сортировка по ожиданию |
| `GET /bank/applications/{id}` | Данные клиента; 9 факторов с баллами (`decision.score.factors`); стопы; лимиты по продуктам (`ml /v1/limit` для `WORKING_CAPITAL` и `OVERDRAFT`); рекомендация системы (`decision.outcome`); журнал |
| `GET /bank/reasons` | проксируешь `ml GET /v1/reasons` |
| `POST /bank/applications/{id}/decision` | `{outcome, amount, term, reasonCode, comment}`. `reasonCode` — только из справочника, иначе `400`; `decided_by = SPECIALIST`; при отказе — маршрут с `specialist_decision` |

**Пульт демо (роль ADMIN)**

| Метод и путь | Что делаешь |
|---|---|
| `GET /admin/applications` | Все заявки: компания, сумма, статус, исход, кто решил |
| `POST /admin/demo/reset` | Удалить заявки, пересоздать демо-данные |
| `GET /admin/system` | `{backend: ok, ml: <ml /health>, llm: {enabled, ready, model} из ml /health, policyVersion}` |
| `GET /admin/policy` | проксируешь `ml GET /v1/policy` — веса, пороги, продукты (показать жюри «логика в конфиге») |

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

**`precheck`** (новое поле для фронта): `{chance, amountLow, amountHigh, reasons: [text], text, disclaimer, ownerNote, weather}` из
`amount_range.low/high`, `reasons[].text`, текста `/v1/explain`, `disclaimer`, `owner_note`, `weather`.

**«Погода»** (`weather`): `{rows: [{code, title, rate, monthlyPayment, fullCost, deltaFullCost, note}], disclaimer}` —
приходит из `ml` готовой: в `precheck`, в каждом элементе `offers` (положи в карточку `LoanOffer` полем `weather`) и в
решении (`decisionWeather` в ApplicationView; `null` при отказе, «Нужны данные» и 115-ФЗ). Ничего не пересчитывай.

**ApplicationView** — ответ `GET /applications/{id}`:
```json
{ "applicationId": "uuid", "number": "A-000123", "status": "COUNTER_OFFER", "outcome": "partial",
  "timeline": [ {"title": "Заявка принята", "state": "done", "at": "14:02"},
                {"title": "Проверяем данные", "state": "done", "at": "14:02"},
                {"title": "Оцениваем заявку", "state": "done", "at": "14:03"},
                {"title": "Решение", "state": "done", "at": "14:03"} ],
  "decisionAmount": 2850000, "decisionTerm": 18, "decisionRate": 20.0, "decisionMonthly": 184575, "decisionFullCost": 500852,
  "decisionText": "Вы хотели 3 000 000 ₽ — банк может предложить 2 850 000 ₽ на 18 мес. …",
  "reasons": ["Сумму ограничивает оборот, а не баллы", "Поступления на счёт нерегулярны"],
  "decisionWeather": { "rows": [ ... ], "disclaimer": "Это иллюстрация рисков, а не условия банка." },
  "nextAction": "Посмотрите предложение банка", "routeAvailable": false, "assistantAvailable": true }
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

**RouteView**: `{status, basedOn, steps: [{code, action, term, pointsGain, done}], horizonText, message, disclaimer,
advice, projectedAmount, text}` — из `route.status`, `based_on`, `steps[]`, `horizon_text`, `message`, `disclaimer`,
`advice`, `projection.available_amount`, текста `/v1/explain`.

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
   decision_text = ml /v1/explain {decision, use_llm: true}   (фоном, timeout=40)
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
| `SUBMITTED` … `SPECIALIST_REVIEW` | `withdraw` | `WITHDRAWN` |

Всё остальное → `409 INVALID_TRANSITION`. P2 сам попадёт в `SPECIALIST_REVIEW` (сумма > 2 млн): пока кабинета специалиста
на фронте нет, войди как `specialist` и вызови `POST /bank/applications/{id}/decision` из Swagger — так демо пройдёт.

## Шаг 9. Что поменять во фронте (подсказать фронтендеру)

1. **Экран входа** (новый, до `GoalPage`): форма «логин + пароль» → `POST /auth/login` → токен в `sessionStorage`,
   заголовок `Authorization` во всех запросах; `401` → «Неверный логин или пароль». CLIENT → кабинет клиента,
   SPECIALIST → `/bank`, ADMIN → `/admin`. Кнопок с персонами нет.
2. `src/api.ts`: `const API = import.meta.env.VITE_API_URL ?? "/api/v1"` (в сборке nginx проксирует `/api`;
   для `npm run dev` — прокси в `vite.config.ts` на `http://localhost:8000`).
3. `CompanyPage.tsx`: ИНН и карточка компании **подставляются из `GET /me`**, клиент жмёт «Да, это моя компания».
   Поле ИНН оставить видимым; «Найти компанию» → `GET /companies/{inn}`, на `404` — «Компания не найдена среди ваших».
   Убрать «ООО «Ромашка Трейд»» и `defaultData.inn = "7700000000"`.
4. `App.tsx`: `monthly`/`total` — из `POST /quote` (debounce 300 мс) вместо формулы с 22%;
   `goalOffers` — из `POST /precheck`; `submit` → `POST /submit`; `localStorage` — только кэш, правда — бэкенд.
5. `FinancePage.tsx` → «Показать предложения»: `PUT /applications/{id}`, затем `POST /precheck`.
6. `StatusPage.tsx`: опрос `GET /applications/{id}` раз в 3 с; убрать демо-кнопки исходов, `amount * 0.7`,
   «600 000 ₽» и фразу «Обычно отвечаем в течение рабочего дня»; показывать `decisionText`, `decisionAmount`, `reasons`,
   маршрут из RouteView.
7. `types.ts`: в `Outcome` добавить `"info" | "suspended"`; в `ApplicationData` — `applicationId`.
8. **«Погода»** — блок рядом с суммой на предоценке, в карточках предложений и в решении: строки `weather.rows`
   и подпись `weather.disclaimer`. Ничего не считать на фронте.
9. **Помощник** — на экранах `rejected`, `partial`, `info` и маршрута (`assistantAvailable: true`): поле вопроса →
   сначала `POST /applications/{id}/assistant {question, useLlm: false}` (ответ мгновенно), затем `useLlm: true` и
   подмена текста, если пришёл `source: "LLM"`. Для `suspended` поле не показывать.
10. **Термины** — по `GET /glossary` подчёркивать слова в текстах; по клику — `plain` и `more`.
11. Позже: `/bank` (очередь, карточка, решение) и `/admin` (таблица заявок, сброс, статус системы, политика).

## Шаг 10. Упаковка: всё по одной кнопке

Цель жюри: `git clone` → `docker compose up --build` → открыть **http://localhost:3000** → пройти сценарий по README.

**Сервисы в корневом `docker-compose.yml`** (`ml` и `ollama` там уже есть):

| Сервис | Образ / сборка | Порт наружу | Healthcheck | Зависит от |
|---|---|---|---|---|
| `postgres` | `postgres:16.4-alpine`, volume `pgdata` | — | `pg_isready` | — |
| `ml` | `./ml` | — (только для отладки `8001`) | `GET /health` | — |
| `backend` | `./backend`; при старте: миграции → сиды → uvicorn | — (отладка `8000`) | `GET /api/v1/health` | `postgres`, `ml` — `condition: service_healthy` |
| `frontend` | `./frontend`: multi-stage, `npm ci && npm run build` → `nginx:1.27-alpine` | **3000** | `GET /` | `backend` — `service_healthy` |
| `ollama` | `ollama/ollama:0.12.6`, том `ollama`, **запускается всегда** | — (отладка `11434`) | `ollama list` | — |
| `ollama-pull` | тот же образ, однократно: скачать модель и прогреть | — | — | `ollama` — `service_healthy` |

`frontend/nginx.conf`:
```nginx
server {
  listen 3000;
  root /usr/share/nginx/html;
  location /api/ { proxy_pass http://backend:8000; }
  location / { try_files $uri /index.html; }
}
```

**LLM — включена по умолчанию** (уже в корневом `docker-compose.yml`):
- `docker compose up --build` сам скачивает модель (`qwen3:1.7b`, ~1,4 ГБ) и прогревает её; `ml` её не ждёт — пока она
  качается, все тексты шаблонные (`/health` → `llm.ready = false`), потом помощник включается без перезапуска;
- `backend` не должен зависеть от `ollama` в `depends_on` — только от `ml`;
- выключить: `OLLAMA_URL=` в `.env`; на Mac для разработки быстрее нативная Ollama: `OLLAMA_URL=http://host.docker.internal:11434`.

**Для сдачи (кейс, стр. 7):** `make up` / `./start.sh` как обёртка над compose; `.env.example` со всеми переменными;
lock-файлы (`uv.lock`, `package-lock.json`); экспорт OpenAPI бэкенда в `docs/openapi.yaml` (контракт ML уже в `docs/openapi-ml.yaml`); коллекция Postman по сценарию
P1 → P2 → P3; README со сценарием проверки и демо-логинами; `THIRD_PARTY_NOTICES`; git-тег к дедлайну.

## Шаг 11. Готово, когда

Прогон через фронт после `docker compose up --build`:

| Логин | Ожидаемо |
|---|---|
| `p1` | 8 экранов, `approved`, `decisionMonthly = 43261`, `decisionFullCost = 196774` |
| `p2` | `review` (у специалиста) → вход `specialist`, решение → `partial`, `decisionAmount = 2850000`, `decisionMonthly = 184575` |
| `p3` | на предложениях `chance = 1`; после отправки `rejected`; маршрут: «Погасить сальдо ЕНС» → «Закрыть кредитки» (+8) → «Вся выручка через один счёт» (+12), `horizonText = "~3 мес."` |
| `p4` | `rejected`, `horizonText = "~8 мес., ускорить нельзя"` |
| `p5` | `info` → загрузить файл → `approved`, 300 000 ₽ |
| `zsk` | `suspended`, маршрута нет |
| `p1` пробует открыть заявку `p2` | `403` |

Плюс автотесты на эти сценарии (pytest + httpx, `ml` поднят в compose). Ожидания проверены прогоном функций
шага 4 через `ml` на данных персон — если цифры не сходятся, ошибка в переводе данных, а не в ML.
