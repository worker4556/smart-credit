# Smart Credit — Backend

## Демо-учётки (пароль у всех: `demo`)

| Логин       | Роль        | Компания / персона |
|-------------|-------------|--------------------|
| `p1`        | CLIENT      | Ольга, кофейня (P1) |
| `p2`        | CLIENT      | ООО «Полка» (P2)    |
| `p3`        | CLIENT      | Тимур, автосервис (P3) |
| `p4`        | CLIENT      | Марина, маникюр (P4) |
| `p5`        | CLIENT      | Андрей, стройматериалы (P5) |
| `zsk`       | CLIENT      | ООО ЗСК красный (ZSK) |
| `specialist`| SPECIALIST  | —                  |
| `admin`     | ADMIN       | —                  |

## Быстрый старт

```bash
cp .env.example .env
# поднять Postgres, указать DATABASE_URL
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

### Вход

```http
POST /api/v1/auth/login
{ "login": "p1", "password": "demo" }
→ { "accessToken": "...", "user": { ... company ... } }
```

### Текущий пользователь

```http
GET /api/v1/me
Authorization: Bearer <token>
```

ИНН и данные компании приходят из `/me` после входа.  
Для расчёта ML бэкенд берёт персону по `company.persona_key` вошедшего пользователя.

## Связь с фронтом и ML

Как соединить фронт и ML — [docs/team/backend-instructions.md](../docs/team/backend-instructions.md).
Контракт ML — [docs/api-contract.md, раздел C](../docs/api-contract.md) и [docs/openapi-ml.yaml](../docs/openapi-ml.yaml).

## Миграции базы

Схема БД — миграциями Alembic (`app/migrations/`), они применяются сами при старте backend.
Базы, созданные до появления миграций, помечаются текущей ревизией без пересоздания таблиц.

```bash
uv run alembic revision --autogenerate -m "что изменилось"   # новая миграция после правки app/db/models.py
uv run alembic upgrade head                                  # применить вручную
```

## Тесты

```bash
uv run pytest -q
```

Тесты миграций работают с настоящим PostgreSQL и требуют пустую базу через `TEST_DATABASE_URL`
(в CI её поднимает сервис `postgres`):

```bash
# Windows PowerShell
$env:TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smartcredit_test"
uv run pytest -q
```

Без `TEST_DATABASE_URL` тесты миграций пропускаются, остальные проходят. Не указывайте в
`TEST_DATABASE_URL` рабочую базу: тесты очищают схему `public`.
