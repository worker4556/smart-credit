# Архитектура и взаимодействие компонентов

Смысл продукта — в [concept.md](concept.md), точные запросы и ответы — в [api-contract.md](api-contract.md).

## 1. Компоненты

```mermaid
flowchart LR
    U1([Предприниматель]) --> FE
    U2([Андеррайтер]) --> FE
    FE["frontend<br/>React + Vite<br/>/client · /bank"] -->|REST + JWT| BE

    subgraph core [backend — FastAPI, модульный монолит]
        BE[API]
        WK[Воркер конвейера]
        POL[Кредитная политика<br/>policy.yaml]
    end

    BE <--> DB[(PostgreSQL)]
    WK <--> DB
    WK --> POL
    BE -->|HTTP| ML
    WK -->|HTTP| ML
    BE -->|HTTP| MK
    WK -->|HTTP| MK

    ML["ml — FastAPI<br/>скоринг · предоценка<br/>подбор · объяснения"] -.->|опционально| LLM[Ollama<br/>open-weights LLM]
    MK["mocks — FastAPI<br/>ЕГРЮЛ/ЕГРИП · БКИ · ФНС<br/>ПЭП · АБС"]
```

| Сервис | Порт | Владелец | Отвечает за | Не делает |
|---|---|---|---|---|
| `frontend` | 3000 | Фронт | Два кабинета, состояния экранов | Не считает бизнес-решения |
| `backend` | 8000 | Бэк | Заявки, state machine, воркер, политика, роли, аудит, файлы | Не содержит ML-логику |
| `ml` | 8001 | ML | Скоринг, предоценка, подбор продукта, тексты объяснений | Не хранит состояние, не ходит в БД |
| `mocks` | 8002 | ML (помогает бэку) | Детерминированные ответы внешних систем по ИНН | Не знает о заявках |
| `postgres` | 5432 | Бэк | Все данные + очередь задач конвейера | — |
| `ollama` | 11434 | ML | LLM для объяснений (профиль `llm`) | Без него всё работает |

### Правила взаимодействия

1. **Фронт ходит только в `backend`.** В `ml` и `mocks` напрямую — никогда.
2. **`ml` и `mocks` — stateless.** Состояние живёт только в Postgres бэкенда.
3. **Скоринг ≠ решение.** `ml` возвращает оценку риска, итоговое решение принимает `backend` по `policy.yaml`.
4. **Любой вызов `ml` / `mocks`** — таймаут 3 с, до 3 ретраев с backoff. Если LLM недоступен, `ml` отдаёт шаблонный текст.
5. **Статус заявки меняет только state machine** в `backend`. Каждый переход пишется в `application_events`.
6. **Фронт узнаёт об изменениях опросом** `GET /applications/{id}` раз в 3 с, пока заявка в автоматическом этапе (SSE — улучшение, если будет время).

## 2. Жизненный цикл заявки

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> SUBMITTED: клиент подал
    DRAFT --> CANCELLED: клиент удалил
    SUBMITTED --> CHECKING: воркер
    CHECKING --> ENRICHING: данные корректны
    CHECKING --> REJECTED: стоп-фактор (ликвидирован)
    ENRICHING --> SCORING: ЕГРЮЛ, БКИ, ФНС получены
    SCORING --> DECIDING: оценка получена
    DECIDING --> APPROVED
    DECIDING --> COUNTER_OFFER
    DECIDING --> REJECTED
    DECIDING --> INFO_REQUESTED: не хватает данных
    DECIDING --> MANUAL_REVIEW: пограничный риск
    MANUAL_REVIEW --> APPROVED: андеррайтер
    MANUAL_REVIEW --> COUNTER_OFFER: андеррайтер
    MANUAL_REVIEW --> REJECTED: андеррайтер
    MANUAL_REVIEW --> INFO_REQUESTED: андеррайтер
    INFO_REQUESTED --> SCORING: клиент дозагрузил
    APPROVED --> OFFER_ACCEPTED: клиент принял
    COUNTER_OFFER --> OFFER_ACCEPTED: клиент принял
    APPROVED --> CANCELLED: клиент отказался
    COUNTER_OFFER --> CANCELLED: клиент отказался
    OFFER_ACCEPTED --> SIGNING: запрос подписи
    SIGNING --> SIGNED: код подтверждён
    SIGNED --> DISBURSED: АБС-мок выдал
    REJECTED --> [*]
    CANCELLED --> [*]
    DISBURSED --> [*]
```

| Статус | Кто двигает дальше | Текст для клиента |
|---|---|---|
| `DRAFT` | Клиент | Черновик — заполните и отправьте |
| `SUBMITTED`, `CHECKING` | Воркер | Проверяем данные |
| `ENRICHING` | Воркер | Запрашиваем сведения о компании и кредитную историю |
| `SCORING`, `DECIDING` | Воркер | Оцениваем заявку |
| `MANUAL_REVIEW` | Андеррайтер | Заявку изучает специалист, обычно до 1 рабочего дня |
| `INFO_REQUESTED` | Клиент | Нужны документы — смотрите задачу |
| `APPROVED` / `COUNTER_OFFER` | Клиент | Одобрено / есть предложение — примите условия |
| `OFFER_ACCEPTED`, `SIGNING` | Клиент | Подпишите договор |
| `SIGNED` | Воркер | Перечисляем деньги |
| `DISBURSED` | — | Деньги на счёте |
| `REJECTED` | — | Отказ, причины и рекомендации |
| `CANCELLED` | — | Заявка отменена |

Недопустимый переход → `409 INVALID_TRANSITION`.

## 3. Сквозные сценарии

### 3.1. Подбор продукта и предоценка (до подачи, ничего не сохраняется кроме черновика)

```mermaid
sequenceDiagram
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant MK as mocks
    participant ML as ml

    C->>FE: «Купить оборудование, 1,5 млн, 36 мес»
    FE->>BE: POST /recommendations
    BE->>ML: POST /v1/recommend
    ML-->>BE: продукты + причины
    BE-->>FE: 1–3 продукта
    C->>FE: выбрал продукт, ввёл ИНН
    FE->>BE: GET /companies/lookup?inn=
    BE->>MK: GET /egrul/{inn}
    MK-->>BE: реквизиты, ОКВЭД, дата регистрации
    BE-->>FE: автозаполнение формы
    FE->>BE: POST /applications (DRAFT)
    C->>FE: двигает сумму/срок
    FE->>BE: POST /applications/{id}/precheck
    BE->>MK: GET /bki/{inn}, GET /fns/{inn}
    BE->>ML: POST /v1/precheck
    ML-->>BE: шансы, ориентир ставки, подсказки
    BE-->>FE: «при 1,2 млн шансы высокие»
```

### 3.2. Подача и автоматический конвейер

```mermaid
sequenceDiagram
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant DB as postgres
    participant WK as воркер
    participant MK as mocks
    participant ML as ml

    C->>FE: «Отправить заявку»
    FE->>BE: POST /applications/{id}/submit (Idempotency-Key)
    BE->>DB: status=SUBMITTED, event, job CHECK
    BE-->>FE: 202 + заявка
    loop пока заявка в автоматическом этапе
        FE->>BE: GET /applications/{id}
    end
    WK->>DB: взять job (FOR UPDATE SKIP LOCKED)
    WK->>WK: CHECK — полнота, лимиты продукта
    WK->>MK: ENRICH — /egrul, /bki, /fns
    WK->>DB: check_results
    WK->>ML: SCORE — POST /v1/score
    ML-->>WK: score, PD, грейд, факторы
    WK->>DB: scoring_results
    WK->>WK: DECIDE — policy.yaml
    WK->>ML: POST /v1/explain
    WK->>DB: decision, offer, event, notification
    FE->>BE: GET /applications/{id}
    BE-->>FE: COUNTER_OFFER + объяснение
```

Каждый этап — отдельная запись в `jobs`. Если `mocks`/`ml` упали — job повторяется, статус заявки не теряется. Повтор этапа идемпотентен (ключ `application_id + stage + attempt_round`).

### 3.3. Ручное рассмотрение и дозапрос

```mermaid
sequenceDiagram
    actor U as Андеррайтер
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant WK as воркер

    Note over BE: DECIDING → MANUAL_REVIEW
    U->>FE: очередь заявок
    FE->>BE: GET /bank/applications?status=MANUAL_REVIEW
    U->>FE: открыть досье
    FE->>BE: GET /bank/applications/{id}
    U->>FE: «Запросить выписку за 6 мес»
    FE->>BE: POST /bank/applications/{id}/info-requests
    BE-->>C: задача + уведомление в кабинете (INFO_REQUESTED)
    C->>FE: загрузил файл
    FE->>BE: POST /applications/{id}/documents
    FE->>BE: POST /tasks/{task_id}/complete
    BE->>WK: job SCORE (повтор с новыми данными)
    WK->>BE: DECIDING → MANUAL_REVIEW
    U->>FE: «Одобрить 3 млн / 24 мес / 19%»
    FE->>BE: POST /bank/applications/{id}/decision
    BE-->>C: APPROVED + уведомление
```

### 3.4. Оффер, подписание, выдача

```mermaid
sequenceDiagram
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant MK as mocks

    C->>FE: «Принять условия»
    FE->>BE: POST /applications/{id}/offer/accept
    FE->>BE: POST /applications/{id}/signature
    BE->>MK: POST /esign/sessions
    MK-->>BE: session_id + демо-код
    BE-->>FE: SIGNING, код показан в интерфейсе
    C->>FE: вводит код
    FE->>BE: POST /applications/{id}/signature/confirm
    BE->>MK: POST /esign/sessions/{sid}/confirm
    BE->>MK: POST /abs/disbursements
    MK-->>BE: номер операции
    BE-->>FE: DISBURSED
```

## 4. Модель данных

```mermaid
erDiagram
    users ||--o{ memberships : ""
    companies ||--o{ memberships : ""
    companies ||--o{ applications : ""
    products ||--o{ applications : ""
    applications ||--o{ application_events : ""
    applications ||--o{ jobs : ""
    applications ||--o{ check_results : ""
    applications ||--o{ scoring_results : ""
    applications ||--o{ decisions : ""
    applications ||--o| offers : ""
    applications ||--o{ tasks : ""
    applications ||--o{ documents : ""
    users ||--o{ notifications : ""

    users {
        uuid id
        string login
        string role
    }
    companies {
        uuid id
        string inn
        string legal_form
        string name
        string okved
        date reg_date
    }
    products {
        string code
        string name
        int min_amount
        int max_amount
        int min_term
        int max_term
        numeric base_rate
    }
    applications {
        uuid id
        uuid company_id
        string product_code
        int amount
        int term_months
        string purpose
        int annual_revenue
        string status
        int version
    }
    application_events {
        uuid id
        uuid application_id
        string from_status
        string to_status
        string actor
        string reason
        timestamp at
    }
    jobs {
        uuid id
        uuid application_id
        string stage
        string state
        int attempts
        timestamp run_after
    }
    check_results {
        uuid id
        uuid application_id
        string source
        string status
        jsonb payload
    }
    scoring_results {
        uuid id
        uuid application_id
        string model_version
        int score
        numeric pd
        string grade
        jsonb factors
    }
    decisions {
        uuid id
        uuid application_id
        string outcome
        jsonb reasons
        string decided_by
        text explanation
    }
    offers {
        uuid id
        uuid application_id
        int amount
        int term_months
        numeric rate
        string status
    }
    tasks {
        uuid id
        uuid application_id
        string type
        string description
        string status
    }
    documents {
        uuid id
        uuid application_id
        string doc_type
        string filename
        string storage_path
    }
    notifications {
        uuid id
        uuid user_id
        uuid application_id
        string text
        bool read
    }
```

`applications.version` — оптимистическая блокировка: параллельные изменения одной заявки дают `409 CONFLICT`.

## 5. Кредитная политика (backend, `policy.yaml`)

Порядок применения:

1. **Стоп-факторы → `REJECTED`:** компания ликвидирована / банкротство; просрочка 90+ дней за 12 мес; налоговый долг выше порога.
2. **Нехватка данных → `INFO_REQUESTED`:** бизнесу < 6 мес без выписки; выручка не подтверждена для суммы выше порога.
3. **По грейду из `ml`:**

| Грейд | Сумма ≤ лимита | Сумма > лимита |
|---|---|---|
| A, B | `APPROVED` | `COUNTER_OFFER` (сумма = лимит) |
| C | `MANUAL_REVIEW` | `MANUAL_REVIEW` |
| D, E | `REJECTED` | `REJECTED` |

- Лимит = `min(product.max_amount, k(грейд) × annual_revenue, сумма при DSCR ≥ 1.3)`.
- Ставка = `product.base_rate + надбавка(грейд)`.
- Пороги и коэффициенты меняются в YAML без правки кода.

## 6. Роли и безопасность

| Роль | Доступ |
|---|---|
| `CLIENT` | Только заявки своих компаний (`/applications/*`) |
| `UNDERWRITER` | Все заявки на чтение, решения по `MANUAL_REVIEW` (`/bank/*`) |
| `ADMIN` | Справочники, сброс демо-данных |

- JWT (демо-пользователи из сидов), проверка роли на каждом эндпоинте.
- Pydantic-валидация всех входов, единый формат ошибок без внутренних деталей.
- Загружаемые файлы: whitelist типов, лимит 10 МБ, хранение в volume, а не в БД.
- Логи в JSON с `request_id`, без персональных данных; `/health` у каждого сервиса.
- Все данные синтетические; секреты только через `.env` (в Git — `.env.example`).

## 7. Структура репозитория

```
backend/    FastAPI: app/{api,domain,workflow,policy,integrations,db}, alembic, tests
ml/         service/ (FastAPI: score, precheck, recommend, explain)
            training/ (генератор синтетики, обучение, отчёт), artifacts/ (модель)
mocks/      FastAPI: egrul, bki, fns, esign, abs + data/personas.json
frontend/   React + Vite + TS: src/{client,bank,shared}
docs/       concept, architecture, api-contract, openapi.yaml, decisions
postman/    коллекция запросов
docker-compose.yml, .env.example, README.md, THIRD_PARTY_NOTICES.md
```
