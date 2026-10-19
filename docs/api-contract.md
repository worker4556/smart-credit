# API-контракт

Статус: **v1, согласуется**. После согласования изменения — только с предупреждением фронта, бэка и ML.
Схема взаимодействия — в [architecture.md](architecture.md). Машиночитаемая схема backend генерируется FastAPI: `http://localhost:8000/docs`, экспорт в `docs/openapi.yaml`.

## Общие соглашения

- Базовый путь backend: `/api/v1`. JSON, `snake_case`, суммы в **рублях целым числом**, ставки — проценты (`19.5`), даты — ISO 8601 UTC.
- Авторизация: `Authorization: Bearer <jwt>`.
- Мутирующие запросы `submit`, `decision`, `offer/accept`, `signature/confirm` принимают `Idempotency-Key` — повтор с тем же ключом возвращает прежний ответ.
- Формат ошибки:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Проверьте поля формы", "fields": { "amount": "Максимум 5 000 000 ₽" } } }
```

| HTTP | `code` | Когда |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Неверные поля |
| 401 | `UNAUTHORIZED` | Нет или просрочен токен |
| 403 | `FORBIDDEN` | Чужая заявка / не та роль |
| 404 | `NOT_FOUND` | Нет объекта |
| 409 | `INVALID_TRANSITION` | Действие недопустимо в текущем статусе |
| 409 | `CONFLICT` | Заявку изменили параллельно (`version`) |
| 502 | `UPSTREAM_UNAVAILABLE` | `ml`/`mocks` недоступны после ретраев |

## Справочники

**Продукты** (`products`):

| code | Название | Сумма, ₽ | Срок, мес | Базовая ставка |
|---|---|---|---|---|
| `WORKING_CAPITAL` | Кредит на пополнение оборотных средств | 300 000 – 10 000 000 | 6–36 | 18.0 |
| `EQUIPMENT` | Кредит на оборудование | 500 000 – 20 000 000 | 12–60 | 16.5 |
| `OVERDRAFT` | Овердрафт | 100 000 – 3 000 000 | 12 | 20.0 |
| `CREDIT_LINE` | Кредитная линия | 1 000 000 – 30 000 000 | 12–36 | 17.5 |

**Цели** (`purpose`): `EQUIPMENT`, `WORKING_CAPITAL`, `CASH_GAP`, `CONTRACT`, `EXPANSION`, `OTHER`.

**Статусы** — см. [architecture.md §2](architecture.md#2-жизненный-цикл-заявки).

---

# A. backend — клиентская часть

### `POST /auth/login`
```json
// req
{ "login": "sokolova", "password": "demo" }
// 200
{ "access_token": "eyJ...", "user": { "id": "uuid", "login": "sokolova", "role": "CLIENT", "full_name": "Соколова Анна" } }
```

### `GET /me`
Пользователь + его компании: `{ "user": {...}, "companies": [ { "id", "inn", "name" } ] }`.

### `GET /products`
Список продуктов из справочника.

### `POST /recommendations`
```json
// req
{ "purpose": "EQUIPMENT", "amount": 1500000, "term_months": 36, "company_id": "uuid|null" }
// 200
{ "items": [
  { "product_code": "EQUIPMENT", "fit": "BEST", "reason": "Подходит для покупки оборудования: срок до 5 лет и ставка ниже оборотного кредита" },
  { "product_code": "WORKING_CAPITAL", "fit": "ALTERNATIVE", "reason": "Если оборудование стоит меньше 500 000 ₽" }
] }
```

### `GET /companies/lookup?inn=500100000002`
Данные ЕГРЮЛ/ЕГРИП для автозаполнения.
```json
{ "inn": "500100000002", "legal_form": "IP", "name": "ИП Соколова Анна Сергеевна", "okved": "56.10",
  "okved_name": "Деятельность ресторанов и услуги по доставке продуктов питания",
  "reg_date": "2024-09-12", "status": "ACTIVE", "address": "г. Москва, ...", "head": "Соколова Анна Сергеевна" }
```

### `POST /applications` → `201`
Создаёт черновик.
```json
// req
{ "company_inn": "500100000002", "product_code": "EQUIPMENT", "purpose": "EQUIPMENT",
  "amount": 1500000, "term_months": 36, "annual_revenue": 9600000, "comment": "Кофемашина La Marzocco" }
```
Ответ — объект **Application** (ниже).

### `PATCH /applications/{id}`
Изменение черновика, только в `DRAFT`. Тело — любые поля из `POST` + `version`.

### `POST /applications/{id}/precheck`
Предварительная оценка, **не является решением** и не меняет статус.
```json
// req
{ "amount": 1500000, "term_months": 36 }
// 200
{ "chance": "MEDIUM",
  "estimated_rate": { "from": 18.5, "to": 21.0 },
  "monthly_payment": 54300,
  "hints": [
    { "change": { "amount": 1200000 }, "chance": "HIGH", "text": "При сумме до 1 200 000 ₽ шансы высокие" },
    { "change": { "term_months": 48 }, "chance": "HIGH", "text": "Увеличьте срок до 48 мес — платёж станет ниже" }
  ],
  "disclaimer": "Предварительная оценка. Итоговое решение принимает банк." }
```
`chance`: `HIGH` | `MEDIUM` | `LOW`.

### `POST /applications/{id}/submit` → `202`
`DRAFT → SUBMITTED`, запускает конвейер. Ответ — **Application**.

### `GET /applications`
Заявки текущего клиента: `{ "items": [ApplicationShort] }`.

### `GET /applications/{id}` — объект **Application**
```json
{
  "id": "uuid", "number": "SC-2026-000123", "version": 4,
  "status": "COUNTER_OFFER",
  "status_text": "Есть предложение — примите условия",
  "next_action": { "actor": "CLIENT", "action": "ACCEPT_OFFER", "text": "Посмотрите предложение банка" },
  "company": { "inn": "500100000002", "name": "ИП Соколова Анна Сергеевна" },
  "product_code": "EQUIPMENT", "purpose": "EQUIPMENT",
  "amount": 1500000, "term_months": 36, "annual_revenue": 9600000,
  "timeline": [
    { "stage": "SUBMITTED", "title": "Заявка отправлена", "state": "DONE", "at": "2026-10-20T10:00:00Z" },
    { "stage": "CHECKING", "title": "Проверка данных", "state": "DONE", "at": "..." },
    { "stage": "ENRICHING", "title": "Сведения о компании и кредитная история", "state": "DONE", "at": "..." },
    { "stage": "SCORING", "title": "Оценка заявки", "state": "DONE", "at": "..." },
    { "stage": "DECISION", "title": "Решение", "state": "CURRENT", "at": "..." },
    { "stage": "SIGNING", "title": "Подписание", "state": "PENDING", "at": null },
    { "stage": "DISBURSED", "title": "Выдача", "state": "PENDING", "at": null }
  ],
  "decision": {
    "outcome": "COUNTER_OFFER",
    "explanation": "Мы готовы выдать 1 200 000 ₽: при запрошенной сумме ежемесячный платёж был бы слишком высок относительно выручки.",
    "reasons": [ { "code": "DSCR_LOW", "text": "Платёж выше допустимой доли выручки" } ],
    "recommendations": [ "Через 6 месяцев стабильной выручки можно запросить увеличение" ]
  },
  "offer": { "id": "uuid", "amount": 1200000, "term_months": 36, "rate": 19.5, "monthly_payment": 44300, "status": "PENDING" },
  "tasks": [],
  "documents": [],
  "created_at": "...", "updated_at": "..."
}
```
`timeline[].state`: `DONE` | `CURRENT` | `PENDING` | `SKIPPED`. `decision`, `offer` — `null`, пока их нет.

### `GET /applications/{id}/events`
Полный журнал переходов: `[ { "from_status", "to_status", "actor", "reason", "at" } ]`.

### `POST /applications/{id}/documents` (multipart)
Поля: `file` (pdf/png/jpg/xlsx/csv, ≤ 10 МБ), `doc_type` (`BANK_STATEMENT`, `FINANCIAL_REPORT`, `OTHER`), `task_id?`. Ответ: `{ "id", "doc_type", "filename", "uploaded_at" }`.

### `POST /tasks/{task_id}/complete`
Клиент сообщает, что задача выполнена. Для `INFO_REQUESTED` → конвейер повторяет `SCORING`.

### `POST /applications/{id}/offer/accept` · `POST /applications/{id}/offer/decline`
`APPROVED|COUNTER_OFFER → OFFER_ACCEPTED` / `→ CANCELLED`.

### `POST /applications/{id}/signature`
`OFFER_ACCEPTED → SIGNING`. Ответ: `{ "session_id": "uuid", "demo_code": "4821", "expires_at": "..." }` — код показывается в интерфейсе вместо SMS.

### `POST /applications/{id}/signature/confirm`
`{ "session_id": "uuid", "code": "4821" }` → `SIGNED`, затем воркер → `DISBURSED`. Неверный код → `400 INVALID_CODE`.

### `GET /notifications` · `POST /notifications/{id}/read`
`{ "items": [ { "id", "application_id", "text", "read", "created_at" } ], "unread": 2 }`.

---

# B. backend — кабинет банка (роль `UNDERWRITER`)

### `GET /bank/applications?status=MANUAL_REVIEW&page=1`
`{ "items": [ { "id", "number", "company_name", "product_code", "amount", "status", "grade", "submitted_at", "sla_due_at" } ], "total": 12 }`.

### `GET /bank/applications/{id}` — досье
**Application** + блоки:
```json
{
  "checks": [
    { "source": "EGRUL", "status": "OK", "summary": "Действующая, 3 года 2 мес" },
    { "source": "BKI", "status": "WARN", "summary": "2 активных кредита, просрочка 15 дней в 2025" },
    { "source": "FNS", "status": "OK", "summary": "Налоговой задолженности нет" }
  ],
  "scoring": {
    "model_version": "scorecard-1.0", "score": 612, "pd": 0.064, "grade": "C",
    "factors": [
      { "feature": "company_age_months", "label": "Возраст бизнеса", "value": 38, "points": 35, "impact": "POSITIVE" },
      { "feature": "max_dpd_12m", "label": "Макс. просрочка за 12 мес", "value": 15, "points": -40, "impact": "NEGATIVE" }
    ]
  },
  "policy": { "limit": 3000000, "rate": 19.0, "triggered_rules": [ "GRADE_C_MANUAL" ] },
  "recommendation": { "outcome": "APPROVED", "text": "Рекомендуем одобрить 3 000 000 ₽ при подтверждении выручки выпиской" },
  "events": [ ... ]
}
```

### `POST /bank/applications/{id}/decision`
Только из `MANUAL_REVIEW`.
```json
{ "outcome": "APPROVED", "amount": 3000000, "term_months": 24, "rate": 19.0, "comment": "Выручка подтверждена выпиской" }
```
`outcome`: `APPROVED` | `COUNTER_OFFER` | `REJECTED`. Для `REJECTED` поле `reasons: [code]` обязательно.

### `POST /bank/applications/{id}/info-requests`
`{ "doc_type": "BANK_STATEMENT", "description": "Выписка по расчётному счёту за 6 месяцев" }` → создаётся задача клиенту, статус `INFO_REQUESTED`.

### `POST /admin/demo/reset` (роль `ADMIN`)
Пересоздаёт демо-данные.

---

# C. ml — внутренний API (`http://ml:8001`)

Статус: **реализовано** (`ml/`). Вызывает только backend. Без состояния. Swagger: `http://localhost:8001/docs`.

### Входные признаки — `ScoringFeatures`
Собирает backend из заявки и `check_results`.

| Поле | Тип | Источник | Обяз. |
|---|---|---|---|
| `legal_form` | `IP` \| `OOO` | ЕГРЮЛ | да |
| `okved` | string, напр. `"56.10"` | ЕГРЮЛ | да |
| `company_age_months` | int ≥ 0 | ЕГРЮЛ | да |
| `annual_revenue` | int ≥ 0, ₽ | клиент | да |
| `requested_amount` | int > 0, ₽ | заявка | да |
| `term_months` | int 1–120 | заявка | да |
| `revenue_confirmed` | bool | есть документ `BANK_STATEMENT` | нет (`false`) |
| `product_code` | string | заявка | нет (`WORKING_CAPITAL`) |
| `annual_rate` | float, % | если не задано — базовая ставка продукта + 2 п.п. | нет |
| `active_loans_count` | int | БКИ | нет (0) |
| `existing_monthly_payments` | int, ₽ | БКИ | нет (0) |
| `max_dpd_12m` | int, дней | БКИ | нет (0) |
| `overdue_count_12m` | int | БКИ (используется политикой, в модель не входит) | нет (0) |
| `tax_debt` | int, ₽ | ФНС | нет (0) |
| `mass_address` | bool | ФНС | нет (`false`) |

Неверные поля → `422` (стандартная ошибка FastAPI).

### `ScoreResult`
```json
{ "model_version": "scorecard-1.0", "score": 563, "pd": 0.0867, "grade": "C",
  "chance": "MEDIUM", "chance_percent": 32, "monthly_payment": 151000,
  "factors": [
    { "feature": "max_dpd_12m", "label": "Макс. просрочка за 12 мес", "value": 15, "bin": "1–30 дн", "points": -61, "impact": "NEGATIVE" },
    { "feature": "company_age_months", "label": "Возраст бизнеса", "value": 38, "bin": "2–4 года", "points": 15, "impact": "POSITIVE" }
  ] }
```
- Грейд по PD: **A** < 2%, **B** < 5%, **C** < 10%, **D** < 20%, **E** ≥ 20%.
- `chance`: A, B → `HIGH`; C → `MEDIUM`; D, E → `LOW`. Это оценка риска, а не решение: политику применяет backend.
- `chance_percent` — индекс для интерфейса (0–100, монотонен по баллу), **не** вероятность одобрения.
- `factors` отсортированы по |points|; `score = base_points + Σ points`.

### `POST /v1/score`
`{ "application_id": "uuid|null", "features": ScoringFeatures }` → `ScoreResult`.

### `POST /v1/score/batch`
`{ "items": [ScoringFeatures, ...] }` (до 200) → `{ "items": [ScoreResult, ...] }` в том же порядке.
Для симуляций «что если» в карте маршрута (backend меняет признаки и прогоняет политику).

### `POST /v1/precheck`
```json
// req
{ "features": { ...ScoringFeatures }, "variants": [], "min_amount": 500000, "max_term_months": 60 }
// 200
{ "model_version": "scorecard-1.0", "chance": "MEDIUM", "chance_percent": 42, "grade": "C", "pd": 0.0712, "monthly_payment": 54606,
  "hints": [
    { "change": { "revenue_confirmed": true }, "chance": "HIGH", "chance_percent": 50, "grade": "B", "text": "Подтвердите выручку выпиской — шансы высокие" },
    { "change": { "amount": 1050000 }, "chance": "HIGH", "chance_percent": 46, "grade": "B", "text": "При сумме до 1 050 000 ₽ шансы высокие" }
  ] }
```
Если `variants` пусто, ML сам перебирает: сумму −10…−60% (шаг 50 000 ₽, не ниже `min_amount`), срок до `max_term_months`, подтверждение выручки.
В `hints` — по одному лучшему варианту каждого вида, только улучшающие шансы.

### `POST /v1/recommend`
```json
// req
{ "purpose": "EQUIPMENT", "amount": 1500000, "term_months": 36 }
// 200
{ "items": [ { "product_code": "EQUIPMENT", "name": "Кредит на оборудование", "fit": "BEST", "reason": "...", "fits_request": true } ] }
```
Если лучший по задаче продукт не подходит по сумме/сроку, вперёд поднимается подходящая альтернатива.

### `POST /v1/explain`
```json
// req
{ "outcome": "COUNTER_OFFER", "requested_amount": 1500000, "offer": { "amount": 1150000, "term_months": 36, "rate": 19.5 },
  "reasons": [ "AMOUNT_ABOVE_LIMIT" ], "factors": [ ...factors из ScoreResult ], "use_llm": true }
// 200
{ "text": "Мы готовы выдать 1 150 000 ₽ вместо 1 500 000 ₽ ...", "template_text": "...", "recommendations": [ "Подтвердите выручку выпиской — лимит может вырасти." ], "source": "TEMPLATE" }
```
- `outcome`: `APPROVED` | `COUNTER_OFFER` | `REJECTED` | `INFO_REQUESTED` | `MANUAL_REVIEW`.
- Коды `reasons`: `DSCR_LOW`, `AMOUNT_ABOVE_LIMIT`, `OVERDUE_90`, `OVERDUE`, `TAX_DEBT`, `COMPANY_INACTIVE`, `FICTITIOUS_SIGNS`, `YOUNG_BUSINESS`, `REVENUE_UNCONFIRMED`, `HIGH_RISK`, `BORDERLINE_RISK`.
- `source`: `LLM` | `TEMPLATE` (LLM выключен или не ответил за `LLM_TIMEOUT_SECONDS`).

### `GET /v1/products` · `GET /health`
Справочник продуктов, как его видит ML · `{ "status": "ok", "model_version": "scorecard-1.0", "llm": "disabled" }`.

---

# D. mocks — внешние системы (`http://mocks:8002`)

Ответы детерминированы по ИНН (персонажи — в [concept.md](concept.md#демо-персонажи)). Неизвестный ИНН генерирует «средний» профиль по хэшу ИНН. ИНН, оканчивающийся на `99`, отвечает `503` на первый запрос — для демонстрации ретраев.

| Метод | Ответ |
|---|---|
| `GET /egrul/{inn}` | `{ inn, legal_form, name, okved, okved_name, reg_date, status: ACTIVE\|LIQUIDATED\|BANKRUPT, address, head }` |
| `GET /bki/{inn}` | `{ active_loans_count, existing_monthly_payments, max_dpd_12m, overdue_count_12m, loans: [ { lender, amount, monthly_payment, dpd } ] }` |
| `GET /fns/{inn}` | `{ tax_debt, mass_address, mass_director, reported_revenue_last_year }` |
| `POST /esign/sessions` | `{ session_id, demo_code, expires_at }` |
| `POST /esign/sessions/{id}/confirm` | `{ code }` → `{ signed: true, signed_at }` |
| `POST /abs/disbursements` | `{ application_id, amount, account }` → `{ operation_id, status: "DONE", executed_at }` |
| `GET /health` | `{ status: "ok" }` |

---

## Демо-учётки (сиды)

| Логин / пароль | Роль | Компании |
|---|---|---|
| `sokolova` / `demo` | CLIENT | ИП Соколова (500100000002) |
| `vector` / `demo` | CLIENT | ООО «Вектор», ООО «Ритм» |
| `stroy` / `demo` | CLIENT | ООО «СтройМонтаж», ИП Ким, ООО «Альтаир» |
| `underwriter` / `demo` | UNDERWRITER | — |
| `admin` / `demo` | ADMIN | — |
