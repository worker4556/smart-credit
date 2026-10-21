# Задание бэкенду: соединяем фронт и ML по контракту

> Рабочие материалы команды, не часть сдачи. **Формы всех запросов и ответов для фронта — в [contract.md](contract.md)**,
> контракт ML — [docs/api-contract.md, раздел C](../api-contract.md) и [docs/openapi-ml.yaml](../openapi-ml.yaml) (Swagger ML:
> `http://localhost:8001/docs`). Файл можно целиком отдать ИИ-ассистенту вместе с `contract.md`.

**Главное правило:** бэкенд **не считает** баллы, лимиты, платежи, причины, маршрут и «Погоду» — это делает ML.
Бэкенд собирает данные, вызывает ML, хранит ответ целиком (JSONB), переводит статус и отдаёт фронту в формате
`contract.md`.

## 0. Что уже сделано и что поправить

Сделано хорошо: вход по логину и паролю (bcrypt + JWT), `/auth/login`, `/me`, проверка ролей, таблицы `users`,
`companies`, `applications`, `application_events`, сиды `p1`…`admin` с паролем `demo`, загрузка
`ml/fixtures/personas.json`.

Поправить:
1. **Роли заглавными:** `CLIENT` / `SPECIALIST` / `ADMIN` — в `seed.py`, в токене, в `require_roles(...)`. Фронт и
   документы ждут заглавные.
2. **`CompanyOut`** дополнить полями из контракта, раздел 1:
   - `activity` — «Кофейня, ОКВЭД 56.10»;
   - `region`, `registrationYear` — из сидов; в персонах их нет, добавь в `ACCOUNTS` по таблице ниже;
   - `averageMonthlyTurnover` — среднее `decision.account.turnover_monthly` за последние 6 месяцев.

   | Персона | Название | Регион | Год регистрации |
   |---|---|---|---|
   | P1 | ИП Ольга · кофейня | Самарская область | 2023 |
   | P2 | ООО «Полка» | Москва | 2024 |
   | P3 | ИП Тимур · автосервис | Республика Башкортостан | 2025 |
   | P4 | ИП Марина · студия маникюра | Новосибирская область | 2026 |
   | P5 | ИП Андрей · стройматериалы | Свердловская область | 2025 |
   | ZSK | ООО «Северный Контур» | Москва | 2023 |
3. **`next_number`** считает все заявки при каждом создании — для демо терпимо, но лучше последовательность в БД.
4. Удалить старый `backend/INSTRUCTIONS.md` — актуальная инструкция теперь этот файл.

## 1. Перевод данных фронта во вход ML

Поля фронта — `ApplicationData` из контракта. Персона — по `company.persona_key` **текущего пользователя**, не по
`inn` из запроса.

```python
def product_for(goal: str) -> str:
    return "OVERDRAFT" if goal == "Перекрыть кассовый разрыв" else "WORKING_CAPITAL"

def build_applicant(app, persona: dict, stage: str) -> dict:
    """stage: PRECHECK (до подачи, без БКИ и ЗСК) или DECISION (после подачи)."""
    d = app.data                                   # ApplicationData
    company = dict(persona["decision"]["company"])
    account = dict(persona["decision"]["account"])
    if app.statement_uploaded:                     # P5 после загрузки выписки
        account["external_turnover_monthly"] = persona["statement_external_turnover"]
    product = product_for(d["goal"])
    if stage == "PRECHECK":
        company.pop("zsk_level", None)             # ЗСК известен только после подачи
        owner = {"source": "SELF_REPORTED",
                 "had_overdue_2y": bool(d.get("hadOverdue2y")),
                 "personal_monthly_payments": d["loanPayment"] if d.get("hasLoans") == "Да" else 0}
    else:
        owner = dict(persona["decision"]["owner"])  # мок БКИ, source = BKI
    return {
        "request": {"product": product, "amount": d["amount"],
                    "term_months": None if product == "OVERDRAFT" else d["term"],   # овердрафт — без срока
                    "has_guarantor": company["legal_form"] == "OOO"},              # у ООО владелец = поручитель
        "company": company, "account": account, "owner": owner,
        "checks": {"declared_monthly_revenue": d["monthlyRevenue"],
                   "missing_documents": [],        # клиенты с РКО: обязательных документов нет
                   "mismatch_unresolved": app.info_requests >= 1 and not app.statement_uploaded,
                   "disputed": False},
    }
```
`collateral` в ML не передаётся. Сценарии с этими данными проверены прогоном через ML — [contract.md, раздел 5](contract.md).

## 2. Вызовы ML

| Когда | Вызов ML | Таймаут бэкенда | Что делать с ответом |
|---|---|---|---|
| `POST /quote` | `/v1/quote {product, amount, term_months}` | `timeout=5`, до 3 повторов | → `Quote` (контракт) |
| `POST /applications/{id}/precheck` | `/v1/precheck` (stage PRECHECK) → `/v1/explain {precheck, use_llm: false}` | 5 с | сохранить, срок действия 30 дней → `PrecheckResponse` |
| фоновая обработка после `submit` | `/v1/decision` (stage DECISION) | 5 с, до 3 повторов | статус по разделу 4; ответ сохранить целиком |
| сразу после решения, **только в фоне** | `/v1/explain {decision, use_llm: true}` | `timeout=40`, **без повторов** | сохранить как `decisionText`; пока нет — шаблон из `use_llm: false` |
| `POST /applications/{id}/route`, `/recalculate` | `/v1/route {applicant, assume_done, specialist_decision?}` → `/v1/explain {route}` | 5 с; explain — `timeout=40` | → `ApplicationRoute` |
| `POST /applications/{id}/assistant` | `/v1/assistant {question, context: {decision, route}, use_llm}` | `use_llm: true` — `timeout=40`, **без повторов**; `false` — 5 с | → `AssistantAnswer` |
| `GET /glossary`, `/glossary/{term}` | `/v1/glossary`, `/v1/glossary/{term}` | 5 с | как есть |
| карточка специалиста | `/v1/limit` для `WORKING_CAPITAL` и `OVERDRAFT`, `/v1/reasons` | 5 с | лимиты по продуктам, справочник |
| `GET /admin/system` | `GET {ML_URL}/health` | 5 с | `llm: {enabled, ready, model}` |

- Повторы — только для вызовов без LLM. Вызов с LLM не повторять: клиент ждал бы до 2 минут, а очередь на
  процессоре росла бы.
- ML ответил `422` (сумма ниже минимума, срок вне 3–36 мес у кредита) → фронту `400 {"detail": <msg из ML>, "field": …}`.
- ML недоступен после повторов: при обработке заявки → `SPECIALIST_REVIEW` с триггером `ML_UNAVAILABLE`; в запросе
  фронта → `502`.
- Пока модель скачивается (`/health` → `llm.ready = false`), ML сам отдаёт шаблонные тексты — это нормально.

## 3. Перевод ответов ML в формат контракта

- **`PrecheckResponse` — плоский:**
  - `chance` → `chance`;
  - `amount_range.low/high` → `amountLow/amountHigh`;
  - `requested_amount` → `requestedAmount`;
  - `reasons[] → {code, text}`;
  - `owner_note` → `ownerNote`;
  - `disclaimer`, `weather`;
  - `text` — из `/v1/explain`;
  - `validUntil` = сегодня + `valid_days`;
  - `goalOffers` — из `offers`.
- **`LoanOffer` из `offers[i]`:**
  - `product`, `name` (по продукту), `amount`, `term_months` → `termMonths`;
  - `cost.rate`, `cost.monthly_payment` → `monthly`, `cost.full_cost` → `fullCost`;
  - `why` = первая причина предоценки;
  - `chance` = шанс предоценки;
  - `weather` = `offers[i].weather`.

  Если `offers` пуст — одна карточка на запрошенную сумму с `chance: "LOW"`.
- **`Weather`** — те же поля в camelCase (`monthly_payment` → `monthlyPayment` и т. д.), без пересчёта.
- **`ApplicationResponse`:** из сохранённого решения ML — `decisionAmount`, `decisionTerm`, `cost.rate` → `decisionRate`,
  `decisionMonthly`, `decisionFullCost`, `weather` → `decisionWeather`, `reasons[].text` → `reasons`, текст explain →
  `decisionText`. `outcome` — по таблице контракта.
- **`ApplicationRoute`:**
  - `steps[]` → `{code, action, term, pointsGain, done, bkiDelayBusinessDays}`, где `done` — из сохранённых отметок;
  - `horizon_text` → `horizonText`;
  - `projection.available_amount` → `projectedAmount`;
  - `based_on` → `basedOn`;
  - `status`, `holds`, `message`, `advice`, `disclaimer` — как есть.

## 4. Статусы и фоновая обработка

Статусы — 15 из спецификации (раздел 5); `outcome` для фронта — по таблице контракта. Смена статуса и запись в
`application_events` — в одной транзакции (у тебя уже есть `change_status`).

После `submit` — фоновая задача (`BackgroundTasks` или asyncio; при старте подхватывать заявки, застрявшие в
`SUBMITTED` / `IN_REVIEW`):

```
SUBMITTED → IN_REVIEW; паузы ~1,5 с между этапами, чтобы лента на StatusPage двигалась
   activity: «Проверяем данные» (Б1+Б2) → «Оцениваем заявку» (Б3) → «Решение» (Б4)
   decision = ML /v1/decision
   SUSPENDED_115FZ                 → SUSPENDED_115FZ (маршрута и помощника нет)
   INFO_REQUESTED                  → INFO_REQUESTED, info_requests += 1,
                                     infoRequest = «Загрузите выписку другого банка за 6 месяцев», срок +14 дней
   specialist.required == true     → SPECIALIST_REVIEW (рекомендация = outcome, триггеры = specialist.triggers)
   иначе                           → APPROVED / COUNTER_OFFER / REJECTED
   затем в фоне: decisionText = ML /v1/explain {decision, use_llm: true}
   REJECTED → сразу построить и сохранить маршрут
```

| Из | Действие | В |
|---|---|---|
| `INFO_REQUESTED` | загружен файл (у персоны есть `statement_external_turnover`) → `statement_uploaded = true` | `IN_REVIEW`, обработка заново |
| `SPECIALIST_REVIEW` | решение специалиста | `APPROVED` / `COUNTER_OFFER` / `INFO_REQUESTED` / `REJECTED`; при отказе — маршрут с `specialist_decision` |
| `APPROVED`, `COUNTER_OFFER` | `accept` | `OFFER_ACCEPTED` |
| `COUNTER_OFFER` | `decline` | `DECLINED_BY_CLIENT` + маршрут |
| `OFFER_ACCEPTED` | `sign` | `SIGNED` → сразу `DISBURSED` |
| `SUBMITTED` … `SPECIALIST_REVIEW` | `withdraw` | `WITHDRAWN` |
| `APPROVED`, `COUNTER_OFFER` / `INFO_REQUESTED` | 30 / 14 дней без ответа | `EXPIRED` |

Всё остальное → `409`. Каждая заявка — только своей компании: чужая → `404`.

## 5. Специалист и пульт демо

Эндпоинты — [contract.md, разделы 3–4](contract.md#3-специалист-роль-specialist). Карточка специалиста:
- факторы — `decision.score.factors` (`label`, `points`, `max_points`);
- стопы — `decision.score.stops[].text`;
- лимиты — `/v1/limit` по двум продуктам;
- рекомендация — `outcome` и `amount` решения ML.

`reasonCode` проверять по `/v1/reasons`.

## 6. Упаковка — всё по одной кнопке

В `docker-compose.yml` уже есть `frontend`, `ml`, `ollama`, `ollama-pull`. Добавить:

| Сервис | Что | Зависит от |
|---|---|---|
| `postgres` | `postgres:16.4-alpine`, том `pgdata`, healthcheck `pg_isready` | — |
| `backend` | `./backend/Dockerfile` (python:3.12-slim + `uv sync --frozen`); при старте — создание таблиц и сиды, затем uvicorn на 8000; том `./ml/fixtures:/app/ml/fixtures:ro` — `personas.py` уже ищет файл по `/app/ml/fixtures/personas.json`; env: `DATABASE_URL`, `ML_URL=http://ml:8001`, `SECRET_KEY` | `postgres` и `ml` — `condition: service_healthy` |
| `frontend` | уже есть; добавить `depends_on: backend` | `backend` |

- `ml` уже имеет healthcheck в Dockerfile. `backend` не зависит от `ollama`: ML работает и без готовой модели.
- LLM включена по умолчанию: `ollama` запускается всегда, `ollama-pull` сам качает модель `qwen3:1.7b`.
  Выключить — `OLLAMA_URL=` в `.env`.
- `SECRET_KEY` — из `.env`, в `.env.example` заглушка.

## 7. Тесты (pytest, ML поднят)

| Сценарий | Ожидаемо |
|---|---|
| Вход `p1` / `demo` | 200 |
| Неверный пароль | 401 |
| Запрос без токена | 401 |
| `p1` открывает `/bank/queue` | 403 |
| `p1` открывает заявку `p2` | 404 |
| Сценарии `p1`…`zsk` | цифры из [contract.md, раздел 5](contract.md) |
| Кредит со сроком вне 3–36 мес | 400 с текстом ML |
