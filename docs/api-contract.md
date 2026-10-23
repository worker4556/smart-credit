# API-контракт

Описание реализованного API. Машиночитаемые схемы: backend — [openapi-backend.json](openapi-backend.json)
(Swagger: `http://localhost:8000/docs`), движок одобрения — [openapi-ml.yaml](openapi-ml.yaml)
(Swagger: `http://localhost:8001/docs`). Готовые запросы — [postman/](postman/). Схема взаимодействия — в
[architecture.md](architecture.md).

## Общие соглашения

- Базовый путь backend: `/api/v1`. Фронт ходит через nginx: `http://localhost:3000/api/v1` (напрямую — `:8000`).
- JSON в **camelCase** (backend) и **snake_case** (ml). Суммы — рубли целым числом, ставки — проценты (`20.0`),
  время — ISO 8601 с часовым поясом.
- Авторизация: `Authorization: Bearer <accessToken>` из `POST /auth/login`. Роль проверяется на каждом эндпоинте.
- Формат ошибки: `{ "detail": "Текст для человека" }`, для ошибки поля — `{ "detail": "...", "field": "amount" }`.

| HTTP | Когда |
|---|---|
| 400 | Неверные данные или ограничение продукта (например, сумма вне диапазона) |
| 401 | Нет или просрочен токен, неверный логин/пароль |
| 403 | Не та роль |
| 404 | Нет объекта или заявка чужой компании |
| 409 | Действие недопустимо в текущем статусе (подписать неодобренную, отправить не черновик) |
| 422 | Тело не прошло валидацию |
| 502 | Движок `ml` недоступен после 3 попыток |

**Продукты.** `WORKING_CAPITAL` — оборотный кредит (аннуитет), `OVERDRAFT` — овердрафт (проценты на использованный
остаток + комиссия за установку лимита). Продукт выбирается по цели: «Перекрыть кассовый разрыв» → овердрафт,
остальные цели → оборотный кредит. Диапазоны и ставки — в `ml/config/policy.yaml`.

**Статусы** — см. [architecture.md §2](architecture.md#2-жизненный-цикл-заявки).

---

# A. backend — клиент (роль `CLIENT`)

### `POST /auth/login` (без токена)
```json
{ "login": "p1", "password": "demo" }
→ { "accessToken": "eyJ...", "user": { "id": "uuid", "login": "p1", "role": "CLIENT", "name": "Ольга",
     "company": { "inn": "631200000001", "name": "ИП Ольга · кофейня", "legalForm": "IP", "okved": "56.10",
                  "activity": "Кофейня, ОКВЭД 56.10", "region": "Самарская область", "registrationYear": 2023,
                  "averageMonthlyTurnover": 950000 } } }
```

### `GET /me` → тот же `user`. `GET /companies/{inn}` → компания, только своя (иначе `404`).

### `POST /intent` — разбор свободной фразы
`{ "text": "Нужно 850 тысяч на 2 года на закупку" }` → `{ goal, amount, term, missing[], productReason, needsConfirmation, source: "LLM"|"RULES" }`

### `POST /quote` — платёж на лету
`{ goal, amount, term }` → `{ monthly, total, fullCost, rate, termMonths, disclaimer }`

### Заявка — тело `ApplicationData`
```json
{ "goal": "Закупить товар или материалы", "amount": 850000, "term": 24, "monthlyRevenue": 950000,
  "hasLoans": "Да", "loanPayment": 20000, "hadOverdue2y": false, "collateral": "",
  "consent1": true, "consent2": true, "docs": {} }
```
`monthlyRevenue`, `hasLoans`, `loanPayment`, `hadOverdue2y` — ответы шага «Финансы» (шаг можно пропустить).

| Метод | Что делает | Статус до → после |
|---|---|---|
| `GET /applications` | Заявки своей компании, новые первыми | — |
| `POST /applications` → `201` | Создать черновик | → `DRAFT` |
| `GET /applications/{id}` | Заявка (объект **Application**, ниже) | — |
| `PUT /applications/{id}` | Сохранить черновик | `DRAFT` |
| `POST /applications/{id}/precheck` | Предоценка без БКИ (**Precheck**, ниже) | `DRAFT` |
| `POST /applications/{id}/submit` | Отправить; нужны оба согласия. Конвейер запускается в фоне | `DRAFT` → `SUBMITTED` → `IN_REVIEW` → решение |
| `POST /applications/{id}/documents` (multipart `file`) | Дозагрузка выписки в ту же заявку, повторная оценка | `INFO_REQUESTED` → `IN_REVIEW` |
| `POST /applications/{id}/accept` | Принять условия (тело опционально: `{ amount, term }`) | `APPROVED`/`COUNTER_OFFER` → `OFFER_ACCEPTED` |
| `POST /applications/{id}/decline` | Отклонить иные условия | `COUNTER_OFFER` → `DECLINED_BY_CLIENT` |
| `POST /applications/{id}/sign` | Подписать (демо), выдача в фоне | `OFFER_ACCEPTED` → `SIGNED` → `DISBURSED` |
| `POST /applications/{id}/withdraw` | Отозвать до решения | `SUBMITTED`/`SPECIALIST_REVIEW` → `WITHDRAWN` |
| `POST /applications/{id}/route` | Маршрут к одобрению (**Route**, ниже) | — |
| `POST /applications/{id}/route/recalculate` | Пересчёт: `{ "doneSteps": ["S_TAX", "O_DEBT"] }` → **Route** | — |
| `POST /applications/{id}/assistant` | Помощник на любой стадии: `{ question, useLlm }` → `{ answer, source, topic, terms[] }`. До подачи отвечает по предоценке, на проверке и после одобрения — по стадии, при отказе — по решению и маршруту | — |
| `GET /glossary`, `GET /glossary/{term}` | Словарь простых слов | — |

### Объект **Application**
```json
{ "applicationId": "uuid", "number": "A-000001", "status": "COUNTER_OFFER", "outcome": "partial", "submitted": true,
  "goal": "Закупить товар или материалы", "amount": 3000000, "term": 18,
  "nextAction": "Посмотрите предложение банка", "decisionText": "Вы хотели 3 000 000 ₽ — банк может предложить 2 850 000 ₽ ...",
  "decisionAmount": 2850000, "decisionTerm": 18, "decisionRate": 20.0, "decisionMonthly": 184575, "decisionFullCost": 500852,
  "decisionWeather": { "rows": [ ... ], "disclaimer": "..." },
  "reasons": ["Сумму ограничивает оборот, а не баллы", "..."],
  "infoRequest": null, "routeAvailable": false, "assistantAvailable": true,
  "activity": [ { "at": "2026-10-22T16:44:00+00:00", "text": "Заявка отправлена" } ] }
```
`outcome` — упрощённый статус для экрана: `review | specialist | approved | partial | info | rejected | suspended`.
При `REJECTED`, `INFO_REQUESTED`, `SUSPENDED_115FZ` суммы решения не отдаются.

### Объект **Precheck**
`{ chance: "HIGH"|"MEDIUM"|"LOW", amountLow, amountHigh, requestedAmount, reasons: [{ code, text }], text, ownerNote,
disclaimer, validUntil, weather, goalOffers: [ LoanOffer ] }`

`LoanOffer`: `{ kind: "REQUESTED"|"WITHIN_ESTIMATE"|"OTHER_TERM"|"OTHER_PRODUCT", product, name, amount, termMonths, rate,
monthly, fullCost, why, chance, weather }`. Варианты упорядочены движком: первый — лучший реалистичный.

### Объект **Route**
`{ status: "ACTIVE"|"READY"|"NO_ROUTE", holds: "SCORE"|"STOP"|"TIME_WINDOW"|"TURNOVER"|"STOP_PERMANENT"|"NONCREDIT"|"NONE",
basedOn: "SYSTEM"|"SPECIALIST", steps: [{ code, action, term, pointsGain, done, bkiDelayBusinessDays }], horizonText, message,
advice[], projectedAmount, disclaimer, text }`. После решения специалиста маршрут строится от его решения.

---

# B. backend — кредитный специалист (роль `SPECIALIST`)

| Метод | Что делает |
|---|---|
| `GET /bank/queue` | Очередь `SPECIALIST_REVIEW`: `[{ applicationId, number, companyName, amount, triggers[], waitingMinutes }]` |
| `GET /bank/applications/{id}` | Досье: всё из **Application** + `factors[{ label, points, maxPoints }]`, `stops[]`, `limits{ WORKING_CAPITAL, OVERDRAFT }`, `recommendation{ outcome, amount }`, `events[]` |
| `GET /bank/reasons` | Справочник причин движка — специалист выбирает код только из него |
| `POST /bank/applications/{id}/decision` → `204` | `{ outcome: "APPROVED"|"COUNTER_OFFER"|"INFO_REQUESTED"|"REJECTED", amount?, term?, reasonCode, comment }`. Код причины обязателен; решение пишется в журнал |

Триггеры попадания к специалисту: `AMOUNT_ABOVE_2M`, `BORDERLINE_SCORE`, `MISMATCH_UNRESOLVED`, `CLIENT_DISPUTE`,
а также ошибка движка при автоматической оценке.

# B2. backend — администратор (роль `ADMIN`)

| Метод | Что делает |
|---|---|
| `GET /admin/system` | `{ backend, ml, llm{ enabled, ready, model }, policyVersion }` |
| `GET /admin/applications` | Все заявки: `[{ applicationId, number, companyName, amount, status, outcome, decidedBy }]` |
| `POST /admin/demo/reset` → `204` | Удалить все заявки и события; учётки остаются |

---

# C. ml — движок одобрения (`http://ml:8001`)

Статус: **реализовано** (`ml/`), по спецификации MVP «Маршрут к одобрению». Вызывает только backend. Без состояния.
Swagger: `http://localhost:8001/docs`. **Машиночитаемый контракт — [`docs/openapi-ml.yaml`](openapi-ml.yaml)**, он генерируется из
кода (`uv run python -m service.export_openapi`), а тест не даёт ему разойтись с кодом. Одна модель правил (`ml/config/policy.yaml`, `ml/config/reasons.yaml`) считает
предоценку, скоринг (Б3), решение (Б4), причины и маршрут — backend не дублирует эту логику, а сохраняет результат
и переводит статусы по `outcome` и `specialist.required`.

### Вход — `Applicant`
Собирает backend из моков источников и ответов клиента. Неверные поля → `422`.

Запрос проверяется по параметрам продукта (`/v1/precheck`, `/v1/decision`, `/v1/score`, `/v1/limit`, `/v1/route`, `/v1/quote`): срок вне диапазона продукта (оборотный кредит 3–36 мес.; у овердрафта только 12 или не задан) или сумма ниже минимума → `422`, срок не обрезается молча. Формат — как у ошибок валидации FastAPI:
`{"detail": [{"loc": ["body", "request", "term_months"], "msg": "Срок для продукта «Оборотный кредит»: от 3 до 36 мес.", "type": "value_error.product_range"}]}`. Сумма выше максимума продукта — не ошибка: это иные условия.

| Блок | Поля | Источник |
|---|---|---|
| `request` | `product` (`WORKING_CAPITAL` \| `OVERDRAFT`), `amount`, `term_months` (для овердрафта не нужен), `has_guarantor` | заявка |
| `company` | `legal_form`, `okved`, `status` (`ACTIVE` \| `LIQUIDATING` \| `LIQUIDATED`, иначе стоп `S_INACTIVE`), `business_age_months`, `tax_debt`, `fns_blocked`, `bankruptcy`, `recovery_lawsuit`, `fssp_debt`, `zsk_level` (`GREEN`/`YELLOW`/`RED`, после Б2), `measures_115fz` | ЕГРЮЛ/ЕГРИП, «Прозрачный бизнес», ФССП, арбитраж, ЗСК |
| `account` | `turnover_monthly` (1–12 мес., от старых к новым), `rko_months`, `business_debt`, `business_monthly_payments`, `external_turnover_monthly` (выписка другого банка) | счёт в Альфе, документы |
| `owner` | `source` (`SELF_REPORTED` до подачи \| `BKI` после Б2), `had_overdue_2y`, `current_overdue`, `max_dpd_24m`, `months_since_90plus`, `personal_monthly_payments`, `card_utilization` | ответы клиента / БКИ |
| `checks` | `declared_monthly_revenue`, `missing_documents`, `mismatch_unresolved`, `disputed` | заявка, Б1 |

Пример — `ml/fixtures/personas.json` (P1–P5, ЗСК).

### `POST /v1/intent` — шаг 1
`{ "text": "нужно 800 тыс. на закупку к сезону", "use_llm": true }` →
```json
{ "purpose": "PURCHASE", "purpose_text": "Закупка товара, сырья или материалов", "amount": 800000, "term_months": null,
  "product": "WORKING_CAPITAL", "product_reason": "Оборотный кредит: ...", "missing": ["term_months"],
  "needs_confirmation": true, "source": "RULES" }
```
`purpose`: `PURCHASE` | `CASH_GAP` | `CONTRACT` | `EQUIPMENT` | `EXPANSION` | `OTHER`. Поля из `missing` клиент заполняет в форме.

### `POST /v1/quote` — калькулятор для ползунков (без скоринга)
`{ "product": "WORKING_CAPITAL", "amount": 850000, "term_months": 24 }` →
`{ "monthly_payment": 43261, "total_paid": 1038274, "interest": 188274, "fee": 8500, "full_cost": 196774, "rate": 20.0, "schedule": [ { "month": 1, "payment": 43261, "principal": 29095, "interest": 14167, "balance": 820905 }, ... ], "note": "Расчёт предварительный, по демо-ставке. Это не оферта." }`.
Для овердрафта `monthly_payment` — проценты за месяц при полном использовании, `schedule` пустой.

### `POST /v1/weather` — «Погода»: стоимость при неблагоприятных условиях
Тело как у `/v1/quote` + необязательный `rate` (ставка решения). Иллюстрация рисков, **на решение не влияет**. P1 →
```json
{ "rows": [ { "code": "BASE", "title": "Сейчас", "rate": 20.0, "monthly_payment": 43261, "full_cost": 196774, "delta_full_cost": 0, "note": null },
            { "code": "RATE_UP", "title": "Если ставка вырастет на 2 п.п. — например, при плавающей ставке или рефинансировании", "rate": 22.0, "monthly_payment": 44096, "full_cost": 216814, "delta_full_cost": 20040, "note": null },
            { "code": "OVERDUE_30", "title": "Если задержать платёж на 30 дней", "rate": 20.0, "monthly_payment": 43261, "full_cost": 198072, "delta_full_cost": 1298, "note": "Просрочка попадёт в кредитную историю владельца …" } ],
  "disclaimer": "Это иллюстрация рисков, а не условия банка." }
```
Пени — 0,1% в день от просроченной суммы (для кредита — один платёж, для овердрафта — весь лимит) за 30 дней.
Тот же расчёт приходит полем `weather` в `/v1/precheck` (на запрошенную сумму), в каждом элементе `offers[]` и в
`/v1/decision` — только когда в решении есть сумма (`APPROVED`, `COUNTER_OFFER`), иначе `null`.

### `POST /v1/precheck` — шаг 3 (без заявки и БКИ), тело `Applicant`
```json
{ "chance": "MEDIUM", "expected_outcome": "COUNTER_OFFER", "score": 72,
  "amount_range": { "low": 2550000, "high": 2850000 }, "requested_amount": 3000000,
  "cost": { "product": "WORKING_CAPITAL", "amount": 3000000, "term_months": 18, "rate": 20.0, "monthly_payment": 194290, "fee": 30000, "full_cost": 527213 },
  "reasons": [ { "code": "L_TURNOVER", "kind": "LIMIT", "category": "Финансовые показатели", "text": "Сумму ограничивает оборот, а не баллы", "shortfall": null },
               { "code": "B_TURNOVER", "kind": "FACTOR", "category": "Финансовые показатели", "text": "Поступления на счёт нерегулярны", "shortfall": 15 } ],
  "offers": [ { "kind": "WITHIN_ESTIMATE", "product": "WORKING_CAPITAL", "amount": 2850000, "term_months": 18, "cost": { "...": "..." } } ],
  "owner_note": "Кредитную историю проверим после подачи — результат может измениться.",
  "valid_days": 30, "disclaimer": "Это оценка по текущим данным, а не решение банка. Действует 30 дней." }
```
`chance`: `HIGH` (ожидается одобрение) | `MEDIUM` (иные условия) | `LOW` (отказ). `amount_range` — «высота», `requested_amount` — «вершина».

### `POST /v1/decision` — Б3 + Б4, тело `Applicant`
```json
{ "outcome": "COUNTER_OFFER", "requested_amount": 3000000, "amount": 2850000, "term_months": 18,
  "cost": { "monthly_payment": 184575, "fee": 28500, "full_cost": 500852, "...": "..." },
  "limit": { "limit": 2850000, "binding": "TURNOVER", "components": { "TURNOVER": 2850000, "DEBT": 3900000, "PAYMENT": 4014626, "PRODUCT_MAX": 5000000 } },
  "reasons": [ { "code": "L_TURNOVER", "...": "..." }, { "code": "B_TURNOVER", "...": "..." } ],
  "specialist": { "required": true, "triggers": ["AMOUNT_ABOVE_2M"] },
  "score": { "score": 72, "owner_source": "BKI", "factors": [ { "factor": "turnover_regularity", "label": "Регулярность оборотов", "layer": "BUSINESS", "reason_code": "B_TURNOVER", "value": 0.336, "points": 5, "max_points": 20, "shortfall": 15 } ], "stops": [], "turnover_monthly_avg": 1900000 },
  "offers": [ ... ] }
```
- `outcome`: `APPROVED` | `COUNTER_OFFER` | `INFO_REQUESTED` | `REJECTED` | `SUSPENDED_115FZ`.
- `specialist.required = true` → backend ставит «У специалиста»; `outcome` — рекомендация системы. Триггеры: `AMOUNT_ABOVE_2M`, `BORDERLINE_SCORE`, `MISMATCH_UNRESOLVED`, `CLIENT_DISPUTE`.
- `reasons`: при отказе по стопу — стоп + до 4 факторов с наибольшим недобором; иначе до 4 причин.
- Иные условия при 50–69 баллах всегда отличаются от запроса: сумма = лимит × 0,75 (60–69) или × 0,5 (50–59) **и ставка выше базовой** на `rate_add` полосы (+2 / +4 п.п.), первая причина — `R_RISK_PRICE`. Ставка с надбавкой — в `cost.rate` решения, предложений, предоценки и прогноза маршрута.
- `INFO_REQUESTED` с `D_MISMATCH` — только если заявленная выручка **выше** оборота по счёту больше чем на 30% (часть выручки мимо счёта). Заявлено меньше — банк опирается на счёт и ничего не запрашивает.
- Для овердрафта `cost.monthly_payment` — проценты за месяц при полном использовании, `full_cost` — за год с комиссией.

### `POST /v1/route` — маршрут и «Пересчитать»
`{ "applicant": Applicant, "assume_done": ["S_TAX"], "specialist_decision": null }` → (P3)
```json
{ "status": "ACTIVE", "holds": "STOP", "target_amount": 1200000, "current_score": 53, "current_available_amount": 0,
  "steps": [ { "code": "S_TAX", "kind": "STOP", "action": "Погасить сальдо ЕНС", "term": "недели", "months": 0.5, "points_gain": 0 },
             { "code": "O_DEBT", "kind": "FACTOR", "action": "Закрыть кредитки или снизить лимиты", "term": "недели", "months": 0.5, "points_gain": 8, "bki_delay_business_days": 2 },
             { "code": "B_TURNOVER", "kind": "FACTOR", "action": "Вести всю выручку через один счёт", "term": "3–6 мес.", "months": 3.0, "points_gain": 12 } ],
  "time_gain_points": 4, "horizon_months": 3.0, "horizon_text": "~3 мес.", "reachable": true,
  "projection": { "score": 77, "limit": 1100000, "available_amount": 1100000, "outcome": "COUNTER_OFFER", "amount": 1100000, "cost": { "full_cost": 254649, "...": "..." } },
  "advice": [], "message": "...", "disclaimer": "Это ориентир при текущем темпе, а не обещание одобрения." }
```
- `status`: `ACTIVE` | `READY` (нет стопов, ≥ 70 баллов и лимит ≥ суммы — можно подать новую заявку) | `NO_ROUTE` (115-ФЗ, банкротство, запрещённая отрасль).
- `holds` — что держит результат: `SCORE` | `STOP` | `TIME_WINDOW` | `TURNOVER` | `STOP_PERMANENT` | `NONCREDIT` | `NONE`.
- `assume_done` — шаги, отмеченные клиентом: прогноз по тем же правилам. Не создаёт заявку и не ходит в БКИ.
- `specialist_decision` `{outcome, reason_code, amount?}` — путь G: маршрут от решения специалиста (`based_on = SPECIALIST`), причина специалиста становится первым шагом; код не из справочника → `422`.

### `POST /v1/explain` — текст для клиента
`{ "decision": Decision }` или `{ "precheck": Precheck }` или `{ "route": Route }`, плюс `"use_llm": true` →
`{ "text": "...", "template_text": "...", "source": "TEMPLATE" | "LLM", "fallback_reason": null }`.
LLM только пересказывает шаблон; ответ с новыми числами, кодами, «одобрено» вне одобрения или обещаниями отбрасывается.
115-ФЗ — всегда шаблон. Вызывать в фоне в момент решения и сохранять (LLM на CPU отвечает до 30 с).

### `POST /v1/assistant` — помощник при отказе и нехватке
`{ "question": "почему мне отказали?", "context": { "decision": Decision, "route": Route | null }, "use_llm": true }` →
```json
{ "answer": "Главная причина: Налоговая задолженность. … Решение принимает банк по правилам. Помощник только объясняет.",
  "template_answer": "…", "source": "TEMPLATE", "fallback_reason": null, "topic": "WHY", "terms": [] }
```
- `question` 1–500 символов; в `context` нужен `decision` или `route`, иначе `422`.
- `topic`: `WHY` | `WHAT_TO_DO` | `WHEN` | `TERM` | `AMOUNT` | `OFF_TOPIC` | `NONCREDIT` (115-ФЗ — фиксированный текст, LLM не вызывается) | `NOT_NEEDED` (одобрено).
- Отвечает только по фактам решения и маршрута и по словарю; проверка ответа LLM — как у `/v1/explain`.
- Чтобы клиент не ждал: сначала `use_llm: false` (шаблон мгновенно), затем `use_llm: true` и подмена текста, если `source = LLM`.

### `GET /v1/glossary` · `GET /v1/glossary/{term}` — словарь простых слов
`{ "items": [ { "term": "Овердрафт", "aliases": ["овердрафт"], "plain": "Деньги сверх остатка на счёте. Платите только за дни, когда они взяты", "more": "…" } ] }`.
Один термин — по названию или форме слова («овердрафта»), неизвестный → `404`. 15 терминов — дословно из «Макета», раздел 4.

### Эксплуатация: аудит, `request_id`, метрики, служебный токен
- **Аудит.** `/v1/decision`, `/v1/precheck`, `/v1/route` возвращают поле `audit`:
  `{ "policy_version": "policy-2026.10-2", "engine_version": "2.1.0", "input_hash": "<sha256 входа>", "decided_at": "2026-10-21T18:00:00Z" }`.
  Бэкенд сохраняет его вместе с решением: любое решение воспроизводится — та же версия политики на тех же данных
  даёт тот же результат, а `input_hash` доказывает, что данные не менялись.
- **`X-Request-ID`.** Если бэкенд передал заголовок — ML вернёт его же и запишет в журнал; если нет — сгенерирует.
  Журнал ML — по строке JSON на запрос: `request_id`, метод, путь, статус, `duration_ms`.
- **`GET /metrics`** — Prometheus: `ml_http_requests_total{path,status}`, `ml_http_request_duration_seconds_sum/_count{path}`,
  `ml_decisions_total{outcome}`, `ml_specialist_total`, `ml_texts_total{source}` (LLM / TEMPLATE), `ml_llm_rejected_total`
  (ответы модели, отброшенные проверкой).
- **Служебный токен.** Если в окружении ML задан `ML_SERVICE_TOKEN`, все `/v1/*` требуют заголовок
  `X-Service-Token: <тот же токен>`, иначе `401`. `/health`, `/metrics`, `/docs` открыты. Пусто — проверка выключена.

### Вспомогательные
- `POST /v1/score`, `POST /v1/limit` — отдельно Б3 и лимит (для карточки специалиста).
- `GET /v1/reasons` — справочник причин (специалист выбирает код из него же).
- `GET /v1/policy` — действующие веса, пороги, продукты.
- `GET /health` → `{ "status": "ok", "policy_version": "policy-2026.10-2", "llm": { "enabled": true, "ready": false, "model": "qwen3:1.7b" } }`; `ready = false`, пока модель скачивается, — все тексты в это время шаблонные.

---

# D. Внешние системы — моки

Отдельного сервиса нет: кейс требует автономности, поэтому ответы ЕГРЮЛ/ЕГРИП, счёта, ФНС/ФССП, БКИ и ЗСК
детерминированно заданы для каждой демо-компании в [ml/fixtures/personas.json](../ml/fixtures/personas.json) и
подставляются бэкендом при сборке анкеты для движка (`backend/app/services/applicants.py`). До подачи берутся только
реестры и счёт, владелец — со слов клиента; БКИ и ЗСК — только после подачи. Подписание и выдача смоделированы сменой
статуса. Перечень смоделированных интеграций — в [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

---

## Демо-учётки (сиды)

Пароль у всех — `demo`. Одна учётка клиента — одна компания.

| Логин | Роль | Компания (ИНН) | Путь |
|---|---|---|---|
| `p1` | CLIENT | ИП Ольга, кофейня (`631200000001`) | A — одобрение |
| `p2` | CLIENT | ООО «Полка» (`771500000002`) | B + G — специалист, иные условия |
| `p3` | CLIENT | ИП Тимур, автосервис (`026800000003`) | F → D — отказ, маршрут |
| `p4` | CLIENT | ИП Марина, студия маникюра (`540600000004`) | E — отказ без быстрого пути |
| `p5` | CLIENT | ИП Андрей, стройматериалы (`662300000005`) | C — нужны данные → одобрено |
| `zsk` | CLIENT | ООО «Северный Контур» (`770100000099`) | H — 115-ФЗ |
| `specialist` | SPECIALIST | — | очередь и решения |
| `admin` | ADMIN | — | состояние и сброс демо |
