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

# C. ml — движок одобрения (`http://ml:8001`)

Статус: **реализовано** (`ml/`), по спецификации MVP «Маршрут к одобрению». Вызывает только backend. Без состояния.
Swagger: `http://localhost:8001/docs`. Одна модель правил (`ml/config/policy.yaml`, `ml/config/reasons.yaml`) считает
предоценку, скоринг (Б3), решение (Б4), причины и маршрут — backend не дублирует эту логику, а сохраняет результат
и переводит статусы по `outcome` и `specialist.required`.

### Вход — `Applicant`
Собирает backend из моков источников и ответов клиента. Неверные поля → `422`.

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
115-ФЗ — всегда шаблон.

### Вспомогательные
- `POST /v1/score`, `POST /v1/limit` — отдельно Б3 и лимит (для карточки специалиста).
- `GET /v1/reasons` — справочник причин (специалист выбирает код из него же).
- `GET /v1/policy` — действующие веса, пороги, продукты.
- `GET /health` → `{ "status": "ok", "policy_version": "policy-2026.10-1", "llm": { "enabled": false, "model": null } }`.

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
