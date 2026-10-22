# Архитектура и взаимодействие компонентов

Документ описывает **реализованную** систему: то, что запускается `docker compose up`. Смысл продукта — в
[concept.md](concept.md), запросы и ответы — в [openapi-backend.json](openapi-backend.json) (backend) и
[openapi-ml.yaml](openapi-ml.yaml) (движок одобрения), коллекция запросов — [postman/](postman/).

## 1. Компоненты

```mermaid
flowchart LR
    U1([Предприниматель]) --> FE
    U2([Кредитный специалист]) --> FE
    U3([Администратор демо]) --> FE
    FE["frontend :3000<br/>React + Vite + MUI<br/>nginx: статика + прокси /api"] -->|"REST /api/v1 + JWT"| BE

    subgraph core ["backend :8000 — FastAPI, модульный монолит"]
        BE[API + роли]
        PL[Конвейер заявки<br/>фоновые задачи]
        MK[Моки внешних систем<br/>ЕГРЮЛ/ЕГРИП · счёт · БКИ · ФНС · ЗСК<br/>ml/fixtures/personas.json]
    end

    BE <--> DB[(PostgreSQL :5432<br/>заявки · события · пользователи)]
    PL <--> DB
    BE --> MK
    PL --> MK
    BE -->|"HTTP + X-Service-Token"| ML
    PL -->|HTTP| ML

    ML["ml :8001 — FastAPI, stateless<br/>скоринг · предоценка · решение<br/>маршрут · объяснения · разбор фразы"] -.->|"опционально, только тексты"| LLM["llm :11434<br/>Ollama + qwen3:1.7b<br/>открытые веса, офлайн"]
    ML --- POL[["ml/config/policy.yaml<br/>reasons.yaml"]]
```

| Сервис | Порт | Отвечает за | Не делает |
|---|---|---|---|
| `frontend` | 3000 | Три кабинета: клиент, специалист, администратор. nginx отдаёт статику и проксирует `/api` в backend | Не считает бизнес-решения |
| `backend` | 8000 | Пользователи и роли (JWT), заявки и их статусы, журнал событий, конвейер (Б1–Б4), загрузка документов, моки внешних систем | Не содержит кредитной логики: всё считает `ml` |
| `ml` | 8001 | Движок одобрения по `policy.yaml`: 9 факторов скоринга, стоп-факторы, лимиты продуктов, решение, причины, маршрут, тексты | Не хранит состояние, не ходит в БД, не меняет статусы |
| `postgres` | 5432 | Все данные | — |
| `llm` | 11434 | Пересказ посчитанных фактов человеческим языком, разбор свободной фразы клиента | Не принимает решений. Без LLM всё работает на шаблонах |

### Внешние системы — моки

Кейс запрещает обращаться к системам банка (стр. 10, «Автономность»), поэтому внешние источники смоделированы
детерминированными данными по каждой демо-компании в `ml/fixtures/personas.json`:

| Источник в реальном банке | Что берём из мока | Когда |
|---|---|---|
| ЕГРЮЛ / ЕГРИП | форма, ОКВЭД, возраст бизнеса | с момента входа |
| Счёт в банке (РКО) | обороты за 6 мес., срок обслуживания | до подачи |
| ФНС «Прозрачный бизнес», ФССП, арбитраж | налоговый долг, исполнительные производства | до подачи |
| БКИ | кредитная история владельца | **только после подачи и согласия** |
| ЗСК (115-ФЗ) | уровень риска | **только после подачи** |
| Подпись и выдача (АБС) | смоделированы сменой статуса | после принятия условий |

### Правила взаимодействия

1. **Фронт ходит только в `backend`.** В `ml` и `llm` напрямую — никогда.
2. **`ml` stateless.** Состояние живёт только в Postgres бэкенда.
3. **Скоринг ≠ решение, но модель одна.** Скоринг, решение, предоценка и маршрут считаются одним движком по одному
   `policy.yaml`. Поэтому один и тот же балл даёт разные лимиты по разным продуктам (P2: 72 балла → 2 850 000 ₽
   оборотного кредита и 760 000 ₽ овердрафта). Подробно — [decisions.md](decisions.md).
4. **Вызовы `ml`** — таймаут 5–20 с, до 3 попыток с паузой. Ошибка `ml` переводит заявку к специалисту, а не теряет её.
5. **Статус меняет только backend**, каждый переход пишется в `application_events` (кто, когда, откуда, куда, причина).
6. **Фронт узнаёт об изменениях опросом** `GET /applications/{id}` раз в 3 с, пока банк работает над заявкой.
7. **LLM только пересказывает.** Числа, исход и причины приходят из правил; текст 115-ФЗ всегда шаблонный.

## 2. Жизненный цикл заявки

```mermaid
stateDiagram-v2
    [*] --> DRAFT: клиент вошёл
    DRAFT --> SUBMITTED: клиент отправил (2 согласия)
    SUBMITTED --> IN_REVIEW: Б1 полнота → Б2 обогащение
    IN_REVIEW --> APPROVED: Б3 баллы → Б4 решение
    IN_REVIEW --> COUNTER_OFFER: можно меньше / иначе
    IN_REVIEW --> INFO_REQUESTED: расхождение данных
    IN_REVIEW --> REJECTED: стоп-фактор или мало баллов
    IN_REVIEW --> SUSPENDED_115FZ: красный уровень ЗСК
    IN_REVIEW --> SPECIALIST_REVIEW: триггер (сумма > 2 млн, пограничный балл, ошибка ml)
    SPECIALIST_REVIEW --> APPROVED: специалист + код причины
    SPECIALIST_REVIEW --> COUNTER_OFFER: специалист + код причины
    SPECIALIST_REVIEW --> INFO_REQUESTED: специалист + код причины
    SPECIALIST_REVIEW --> REJECTED: специалист + код причины
    INFO_REQUESTED --> IN_REVIEW: клиент загрузил документ
    APPROVED --> OFFER_ACCEPTED: клиент принял
    COUNTER_OFFER --> OFFER_ACCEPTED: клиент принял
    COUNTER_OFFER --> DECLINED_BY_CLIENT: клиент отклонил
    OFFER_ACCEPTED --> SIGNED: подписание (демо)
    SIGNED --> DISBURSED: выдача (демо)
    SUBMITTED --> WITHDRAWN: клиент отозвал
    SPECIALIST_REVIEW --> WITHDRAWN: клиент отозвал
    APPROVED --> EXPIRED: 30 дней без ответа
    COUNTER_OFFER --> EXPIRED: 30 дней без ответа
    INFO_REQUESTED --> EXPIRED: 14 дней без документа
    DISBURSED --> [*]
    REJECTED --> [*]
    SUSPENDED_115FZ --> [*]
    DECLINED_BY_CLIENT --> [*]
    WITHDRAWN --> [*]
    EXPIRED --> [*]
```

| Статус | Кто двигает дальше | Что видит клиент | Маршрут |
|---|---|---|---|
| `DRAFT` | Клиент | Шаги заявки, предоценка | при низком/среднем шансе или сумме выше оценки |
| `SUBMITTED`, `IN_REVIEW` | Конвейер | Лента этапов, срок не обещается | — |
| `SPECIALIST_REVIEW` | Специалист | «Заявку рассматривает специалист» | — |
| `INFO_REQUESTED` | Клиент | Какой документ и до какой даты | — |
| `APPROVED` | Клиент | Сумма, платёж, полная стоимость | нет |
| `COUNTER_OFFER` | Клиент | «Хотели — можем», принять или отклонить | да: что держит сумму |
| `OFFER_ACCEPTED` → `SIGNED` → `DISBURSED` | Клиент → конвейер | Подписать → перечисляем → деньги на счёте | — |
| `REJECTED` | — | Причины простыми словами | да, в т.ч. от решения специалиста |
| `SUSPENDED_115FZ` | Клиент → Банк России | «Это не оценка кредитоспособности», шаблонный текст и порядок действий по 115-ФЗ со ссылками на cbr.ru | **нет**: это не кредитный отказ |
| `DECLINED_BY_CLIENT`, `WITHDRAWN`, `EXPIRED` | — | Итог и кнопка «Новая заявка» | — |

Действие не в своём статусе (например, подписать неодобренную заявку) → `409 Conflict`.

## 3. Сквозные сценарии

### 3.1. Предоценка до подачи (без БКИ)

```mermaid
sequenceDiagram
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant ML as ml
    participant LLM as llm

    C->>FE: вход → компания (ИНН из учётки) подтверждена
    FE->>BE: POST /applications (DRAFT)
    C->>FE: «Нужно 850 тысяч на 2 года на закупку»
    FE->>BE: POST /intent
    BE->>ML: POST /v1/intent
    ML-->>LLM: разбор фразы (откат на правила, если LLM нет)
    BE-->>FE: цель, сумма, срок — клиент подтверждает
    FE->>BE: POST /quote (платёж на лету)
    C->>FE: финансы (можно пропустить) → «Показать предложения»
    FE->>BE: POST /applications/{id}/precheck
    BE->>ML: POST /v1/precheck (владелец — со слов клиента)
    BE->>ML: POST /v1/explain
    BE-->>FE: шанс, вилка суммы, причины, 1–3 варианта
```

### 3.2. Подача и автоматический конвейер

```mermaid
sequenceDiagram
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant DB as postgres
    participant ML as ml

    C->>FE: «Отправить заявку» (2 согласия)
    FE->>BE: POST /applications/{id}/submit
    BE->>DB: SUBMITTED + событие
    BE-->>FE: заявка
    Note over BE: фоновая задача конвейера
    BE->>DB: IN_REVIEW (Б1 полнота, Б2 обогащение: моки, БКИ, ЗСК)
    BE->>ML: POST /v1/decision (Б3 баллы, Б4 решение)
    ML-->>BE: исход, сумма, стоимость, причины, триггеры специалиста
    BE->>DB: статус по решению + событие
    BE->>ML: POST /v1/route (если отказ)
    loop каждые 3 с
        FE->>BE: GET /applications/{id}
    end
    BE-->>FE: APPROVED / COUNTER_OFFER / INFO_REQUESTED / REJECTED / SUSPENDED_115FZ / SPECIALIST_REVIEW
```

### 3.3. Специалист и маршрут от его решения

```mermaid
sequenceDiagram
    actor S as Специалист
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant ML as ml

    S->>FE: кабинет специалиста
    FE->>BE: GET /bank/queue (только исключения, с триггером)
    S->>FE: открыть досье
    FE->>BE: GET /bank/applications/{id}
    BE-->>FE: 9 факторов, стоп-факторы, лимиты по продуктам, рекомендация системы
    S->>FE: исход + код причины из справочника (обязателен) + комментарий
    FE->>BE: POST /bank/applications/{id}/decision
    BE->>ML: POST /v1/explain
    Note over BE: событие в журнал: кто, когда, код причины
    C->>FE: входит — открывается его заявка
    FE->>BE: POST /applications/{id}/route
    BE->>ML: POST /v1/route (specialist_decision)
    BE-->>FE: маршрут называет то, что держит решение специалиста
```

### 3.4. Дозапрос, принятие, подписание, выдача

```mermaid
sequenceDiagram
    actor C as Клиент
    participant FE as frontend
    participant BE as backend
    participant ML as ml

    Note over C,BE: INFO_REQUESTED — та же заявка, без нового запроса в БКИ
    C->>FE: загрузить выписку
    FE->>BE: POST /applications/{id}/documents
    BE->>ML: повтор Б3–Б4 с учётом выписки
    BE-->>FE: APPROVED
    C->>FE: «Принять условия»
    FE->>BE: POST /applications/{id}/accept
    C->>FE: «Подписать договор»
    FE->>BE: POST /applications/{id}/sign
    Note over BE: SIGNED → DISBURSED (выдача смоделирована, стр. 11 кейса)
    BE-->>FE: «Деньги перечислены на счёт»
```

## 4. Модель данных

```mermaid
erDiagram
    users ||--o| companies : "владеет (1 учётка = 1 ИНН)"
    companies ||--o{ applications : "подаёт"
    applications ||--o{ application_events : "журнал"

    users {
        uuid id PK
        string login UK
        string password_hash "bcrypt"
        string role "CLIENT | SPECIALIST | ADMIN"
        string name
        timestamptz created_at
    }
    companies {
        uuid id PK
        string inn UK
        string name
        string persona_key "ключ мока: P1–P5, ZSK"
        uuid user_id FK
        timestamptz created_at
    }
    applications {
        uuid id PK
        string number UK "A-000001"
        uuid company_id FK
        string status "см. раздел 2"
        int version "растёт при каждом переходе"
        jsonb data "запрос клиента: цель, сумма, срок, выручка, согласия"
        bool statement_uploaded
        int info_requests
        jsonb precheck "ответ ml + текст + срок действия"
        jsonb decision "исход, сумма, стоимость, причины, решение специалиста"
        text decision_text
        jsonb route "маршрут от ml"
        text route_text
        timestamptz created_at
        timestamptz updated_at
    }
    application_events {
        uuid id PK
        uuid application_id FK
        string from_status
        string to_status
        string actor "CLIENT | system | SPECIALIST"
        string reason
        jsonb payload "код причины, триггеры"
        timestamptz at
    }
```

Почему ответы движка лежат в `jsonb`, а не в отдельных таблицах: контракт `ml` развивается вместе с политикой, а
бэкенду важно сохранить ровно то, что показали клиенту и специалисту (аудит). Загруженные файлы хранятся в volume
`backend_uploads`, а не в БД.

## 5. Кредитная политика (`ml/config/policy.yaml`)

Одна модель для предоценки, решения и маршрута: порядок правил, 9 факторов (100 баллов), лимиты продуктов,
справочник причин (`reasons.yaml`) и шаги маршрута. Пороги и коэффициенты меняются в YAML без правки кода.
Подробно — [ml/README.md](../ml/README.md), проверка модели — [model-validation.md](model-validation.md).

## 6. Роли и безопасность

| Роль | Доступ |
|---|---|
| `CLIENT` | Только заявки своей компании (`/applications/*`, `/quote`, `/intent`) |
| `SPECIALIST` | Очередь исключений, досье, решения с кодом причины (`/bank/*`) |
| `ADMIN` | Все заявки, состояние сервисов, сброс демо-данных (`/admin/*`) |

- JWT с ролью, проверка роли на каждом эндпоинте; пароли — bcrypt.
- Pydantic-валидация всех входов; ошибки без внутренних деталей.
- Служебный токен `X-Service-Token` между backend и ml (включается переменной `ML_SERVICE_TOKEN`).
- `X-Request-ID` сквозь backend → ml, метрики Prometheus у ml (`/metrics`), `/health` у каждого сервиса.
- Все данные синтетические; секреты только через `.env` (в Git — `.env.example`).
- Контейнеры backend запускаются от непривилегированного пользователя.

### Что сделали бы для промышленной эксплуатации

| Сейчас (демо) | В банке |
|---|---|
| Конвейер — фоновые задачи FastAPI | Очередь задач (Kafka / RabbitMQ / таблица задач с `SKIP LOCKED`) с повторами по этапам |
| Моки из `personas.json` | Адаптеры к ЕГРЮЛ, БКИ, ФНС, ЗСК с тем же контрактом |
| Таблицы создаются при старте | Миграции Alembic |
| Опрос статуса раз в 3 с | SSE / WebSocket |

## 7. Структура репозитория

```
backend/    FastAPI: app/{api,schemas,services,db}, tests/, Dockerfile, uv.lock
ml/         service/ (движок одобрения), config/ (policy.yaml, reasons.yaml), fixtures/personas.json,
            eval/, tests/, Dockerfile, uv.lock
llm/        Ollama + вшитая модель qwen3:1.7b
frontend/   React + Vite + TS: src/{pages,components,utils}, nginx.conf, package-lock.json
docs/       architecture, concept, decisions, openapi-backend.json, openapi-ml.yaml, postman/,
            test-scenarios.md, test-user-maps.md
scripts/    smoke_api.py — сквозная проверка всех персонажей
docker-compose.yml, .env.example, README.md, THIRD_PARTY_NOTICES.md
```
