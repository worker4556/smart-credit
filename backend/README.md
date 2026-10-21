# Smart Credit — Backend

## Демо-учётки (пароль у всех: `demo`)

| Логин       | Роль        | Компания / персона |
|-------------|-------------|--------------------|
| `p1`        | client      | Ольга, кофейня (P1) |
| `p2`        | client      | ООО «Полка» (P2)    |
| `p3`        | client      | Тимур, автосервис (P3) |
| `p4`        | client      | Марина, маникюр (P4) |
| `p5`        | client      | Андрей, стройматериалы (P5) |
| `zsk`       | client      | ООО ЗСК красный (ZSK) |
| `specialist`| specialist  | —                  |
| `admin`     | admin       | —                  |

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
