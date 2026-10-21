# Контракт фронт ↔ бэкенд ↔ ML — единый источник правды

> Рабочие материалы команды, не часть сдачи. Если код расходится с этим файлом — правится код или этот файл, но
> в одном коммите и с предупреждением в чате команды. Задания по нему: [frontend-instructions.md](frontend-instructions.md),
> [backend-instructions.md](backend-instructions.md). Контракт ML (бэкенд ↔ ML) — [docs/api-contract.md, раздел C](../api-contract.md)
> и [docs/openapi-ml.yaml](../openapi-ml.yaml).

> **Статус ML на 21.10.2026:** «Погода» (`weather`), помощник (`/v1/assistant`), словарь (`/v1/glossary`), калькулятор с
> графиком и `docs/openapi-ml.yaml` готовы в ветке `ml/weather-assistant` и придут в `main` следующим ML-обновлением.
> Делайте эндпоинты и экраны под этот контракт сразу; до прихода обновления помощник, термины и «Погода» будут отвечать
> ошибкой ML — это ожидаемо.

```
браузер ─► localhost:3000 nginx (собранный фронт, /api → backend) ─► backend :8000 ─► ml :8001 ─► ollama :11434
                                                                         ├─► моки = ml/fixtures/personas.json
                                                                         └─► postgres :5432
```

## 0. Общие правила

| Правило | Значение |
|---|---|
| Префикс | `/api/v1`. Фронт ходит **только** в бэкенд, в ML и Ollama — никогда |
| Формат полей | **camelCase везде** между фронтом и бэкендом (бэкенд: `alias_generator=to_camel`) |
| Деньги | рубли целым числом; ставки — проценты числом (`20.0`) |
| Авторизация | `Authorization: Bearer <accessToken>` на всех запросах, кроме `/auth/login` и `/health` |
| Роли | **`CLIENT` / `SPECIALIST` / `ADMIN`** — заглавными, одинаково в токене, ответах и коде |
| Ошибки | `{"detail": "Текст для человека"}`; ошибка поля — `400 {"detail": "…", "field": "amount"}` |
| Коды | `400` — неверные данные (в т. ч. сумма/срок вне продукта), `401` — нет или истёк токен, `403` — не та роль, `404` — нет объекта **или он чужой**, `409` — действие недопустимо в текущем статусе, `502` — ML недоступен |
| Кто считает | Баллы, лимиты, платежи, причины, маршрут, «Погоду», тексты — **только ML**. Бэкенд передаёт и хранит, фронт показывает |

## 1. Вход и профиль

Регистрации нет. Учётки создаёт бэкенд при старте, пароль у всех `demo`:

| Логин | Роль | Компания (ИНН) | Персона в `ml/fixtures/personas.json` |
|---|---|---|---|
| `p1` | CLIENT | Ольга, кофейня (`631200000001`) | `P1` |
| `p2` | CLIENT | ООО «Полка» (`771500000002`) | `P2` |
| `p3` | CLIENT | Тимур, автосервис (`026800000003`) | `P3` |
| `p4` | CLIENT | Марина, студия маникюра (`540600000004`) | `P4` |
| `p5` | CLIENT | Андрей, стройматериалы (`662300000005`) | `P5` |
| `zsk` | CLIENT | ООО с красным уровнем ЗСК (`770100000099`) | `ZSK` |
| `specialist` | SPECIALIST | — | — |
| `admin` | ADMIN | — | — |

P6 (бухгалтер) — Won't в MVP: учётки нет.

**`POST /auth/login`** `{ "login": "p1", "password": "demo" }` →
```json
{ "accessToken": "eyJ…", "user": { "id": "uuid", "login": "p1", "role": "CLIENT", "name": "Ольга",
  "company": { "inn": "631200000001", "name": "ИП Ольга · кофейня", "legalForm": "IP", "okved": "56.10",
               "activity": "Кофейня, ОКВЭД 56.10", "region": "Самарская область", "registrationYear": 2023,
               "averageMonthlyTurnover": 950000 } } }
```
Неверная пара → `401 {"detail": "Неверный логин или пароль"}` (одинаково для неверного логина и пароля).

**`GET /me`** → тот же объект `user`. У SPECIALIST и ADMIN `company: null`.

**`GET /companies/{inn}`** → объект `company` (как выше). Только компания текущего пользователя; чужой или
неизвестный ИНН → `404 {"detail": "Компания не найдена среди ваших"}`.

## 2. Заявка клиента (роль CLIENT)

### `ApplicationData` — тело черновика (фронт → бэкенд)

| Поле | Тип | Что это | В ML |
|---|---|---|---|
| `goal` | строка — одна из 6 карточек `GoalPage` | цель | «Перекрыть кассовый разрыв» → `OVERDRAFT`, остальные → `WORKING_CAPITAL` |
| `amount` | число | желаемая сумма («вершина») | `request.amount` |
| `term` | число 3–36 | срок | `request.term_months`; **для овердрафта не передаётся** (всегда 12) |
| `monthlyRevenue` | число | выручка в месяц со слов клиента | `checks.declared_monthly_revenue` |
| `hasLoans`, `loanPayment` | «Да»/«Нет», число | **личные** платежи владельца по кредитам и кредиткам в месяц (кредиты бизнеса банк видит по счёту сам) | `owner.personal_monthly_payments` (0, если «Нет») |
| `hadOverdue2y` | boolean | «Были ли просрочки за 2 года, включая закрытые?» | `owner.had_overdue_2y` |
| `collateral` | строка | залог | **не используется**: в модели залога нет |
| `consent1`, `consent2` | boolean | согласия | без обоих `submit` → `400` |
| `docs` | объект | загруженные файлы (имена) | — |

`inn` и `company` от фронта бэкенд **игнорирует**: компания и персона берутся из учётки.

### Эндпоинты

| Метод и путь | Тело | Ответ |
|---|---|---|
| `POST /quote` | `{goal, amount, term}` | `Quote` |
| `POST /applications` | `ApplicationData` | `ApplicationResponse` (статус `DRAFT`) |
| `PUT /applications/{id}` | `ApplicationData` | `ApplicationResponse`; только в `DRAFT`, иначе `409` |
| `POST /applications/{id}/precheck` | — | `PrecheckResponse` |
| `POST /applications/{id}/documents` | multipart: `file`, `docId` | `ApplicationResponse` |
| `POST /applications/{id}/submit` | `ApplicationData` | `ApplicationResponse` (`SUBMITTED`, дальше — фоновая обработка) |
| `GET /applications/{id}` | — | `ApplicationResponse` |
| `GET /applications` | — | `[ApplicationResponse]` своих заявок |
| `POST /applications/{id}/route` | — | `ApplicationRoute` |
| `POST /applications/{id}/route/recalculate` | `{doneSteps: ["S_TAX","O_DEBT"]}` | `ApplicationRoute` (без новой заявки и без БКИ) |
| `POST /applications/{id}/assistant` | `{question, useLlm}` | `AssistantAnswer` |
| `POST /applications/{id}/accept` | `{amount?, term?}` в пределах предложения | `204` |
| `POST /applications/{id}/decline` · `/sign` · `/withdraw` | — | `204` |
| `GET /glossary` · `GET /glossary/{term}` | — | словарь / термин (`404`, если нет) |

### `Quote`
```json
{ "monthly": 43261, "total": 1038274, "fullCost": 196774, "rate": 20.0, "termMonths": 24,
  "disclaimer": "Расчёт предварительный, по демо-ставке. Это не оферта." }
```
Из ML `/v1/quote`: `monthly = monthly_payment`, `total = total_paid`, `fullCost = full_cost`, `disclaimer = note`.
Для овердрафта `monthly` — проценты за месяц при полном использовании лимита. Сумма ниже минимума → `400` с текстом ML.

### `PrecheckResponse` (плоский — так уже ждёт фронт)
```json
{ "chance": "MEDIUM", "amountLow": 2550000, "amountHigh": 2850000, "requestedAmount": 3000000,
  "reasons": [ { "code": "L_TURNOVER", "text": "Сумму ограничивает оборот, а не баллы" },
               { "code": "B_TURNOVER", "text": "Поступления на счёт нерегулярны" } ],
  "text": "Шансы на 3 000 000 ₽ — средние. …", "ownerNote": "Кредитную историю проверим после подачи — результат может измениться.",
  "disclaimer": "Это оценка по текущим данным, а не решение банка. Действует 30 дней.", "validUntil": "2026-11-20",
  "weather": Weather, "goalOffers": [ LoanOffer ] }
```
`chance`: `HIGH` | `MEDIUM` | `LOW` — фронт показывает словом «высокий / средний / низкий». `amountLow–amountHigh` —
«высота» (вилка, не точное число), `requestedAmount` — «вершина».

### `LoanOffer` (из `precheck.offers` ML, максимум 3)
```json
{ "product": "WORKING_CAPITAL", "name": "Деньги на текущие расходы", "amount": 2850000, "termMonths": 18, "rate": 20.0,
  "monthly": 184575, "fullCost": 500852, "why": "Сумму ограничивает оборот, а не баллы", "chance": "MEDIUM",
  "weather": Weather }
```
`name`: `WORKING_CAPITAL` → «Деньги на текущие расходы», `OVERDRAFT` → «Овердрафт». Если у ML предложений нет (стоп,
как у P3) — одна карточка на запрошенную сумму с `chance: "LOW"`. «Кредитной линии» нет — её нет в MVP.

### `Weather` («Погода» — из ML как есть, ничего не пересчитывать)
```json
{ "rows": [ { "code": "BASE", "title": "Сейчас", "rate": 20.0, "monthlyPayment": 43261, "fullCost": 196774, "deltaFullCost": 0, "note": null },
            { "code": "RATE_UP", "title": "Если ставка вырастет на 2 п.п. …", "rate": 22.0, "monthlyPayment": 44096, "fullCost": 216814, "deltaFullCost": 20040, "note": null },
            { "code": "OVERDUE_30", "title": "Если задержать платёж на 30 дней", "rate": 20.0, "monthlyPayment": 43261, "fullCost": 198072, "deltaFullCost": 1298, "note": "Просрочка попадёт в кредитную историю …" } ],
  "disclaimer": "Это иллюстрация рисков, а не условия банка." }
```

### `ApplicationResponse`
```json
{ "applicationId": "uuid", "number": "A-000123", "status": "COUNTER_OFFER", "outcome": "partial",
  "submitted": true, "nextAction": "Посмотрите предложение банка",
  "decisionText": "Вы хотели 3 000 000 ₽ — банк может предложить 2 850 000 ₽ на 18 мес. …",
  "decisionAmount": 2850000, "decisionTerm": 18, "decisionRate": 20.0, "decisionMonthly": 184575, "decisionFullCost": 500852,
  "decisionWeather": Weather, "reasons": ["Сумму ограничивает оборот, а не баллы", "Поступления на счёт нерегулярны"],
  "infoRequest": null, "routeAvailable": false, "assistantAvailable": true,
  "activity": [ { "at": "14:02", "text": "Заявка отправлена" }, { "at": "14:03", "text": "Проверяем данные" } ] }
```
- `infoRequest` (только при `info`): `{ "text": "Загрузите выписку другого банка за 6 месяцев", "dueDate": "2026-11-04" }`.
- `decision*`, `decisionWeather` — `null`, пока решения нет, и при `rejected`, `info`, `suspended`.
- `assistantAvailable: true` для `rejected`, `partial`, `info`; `routeAvailable: true` для `rejected` и отклонённого клиентом `partial`.

**`outcome` ← `status`** (внутренние статусы бэкенда — спецификация, раздел 5):

| `status` | `outcome` |
|---|---|
| `DRAFT`, `SUBMITTED`, `IN_REVIEW` | `review` |
| `SPECIALIST_REVIEW` | `specialist` |
| `APPROVED`, `OFFER_ACCEPTED`, `SIGNED`, `DISBURSED` | `approved` |
| `COUNTER_OFFER` | `partial` |
| `INFO_REQUESTED` | `info` |
| `REJECTED`, `DECLINED_BY_CLIENT`, `WITHDRAWN`, `EXPIRED` | `rejected` |
| `SUSPENDED_115FZ` | `suspended` |

### `ApplicationRoute`
```json
{ "status": "ACTIVE", "holds": "STOP", "basedOn": "SYSTEM",
  "steps": [ { "code": "S_TAX", "action": "Погасить сальдо ЕНС", "term": "недели", "pointsGain": 0, "done": false },
             { "code": "O_DEBT", "action": "Закрыть кредитки или снизить лимиты", "term": "недели", "pointsGain": 8, "done": false, "bkiDelayBusinessDays": 2 },
             { "code": "B_TURNOVER", "action": "Вести всю выручку через один счёт", "term": "3–6 мес.", "pointsGain": 12, "done": false } ],
  "horizonText": "~3 мес.", "message": "Шаги ниже снимают ограничения …", "advice": [],
  "projectedAmount": 1100000, "disclaimer": "Это ориентир при текущем темпе, а не обещание одобрения.", "text": "…" }
```
`status`: `ACTIVE` | `READY` (можно подать новую заявку) | `NO_ROUTE` (показать только `message`).
`holds`: `TIME_WINDOW` → «ускорить нельзя» (уже в `horizonText`), `TURNOVER` → «баллы уже не мешают».

### `AssistantAnswer`
`{ "answer": "…", "source": "TEMPLATE" | "LLM", "topic": "WHY" | "WHAT_TO_DO" | "WHEN" | "TERM" | "AMOUNT" | "OFF_TOPIC" | "NONCREDIT" | "NOT_NEEDED", "terms": [] }`.
Фронт сначала шлёт `useLlm: false` (ответ мгновенно), затем `useLlm: true` и подменяет текст, если `source = "LLM"`.

## 3. Специалист (роль SPECIALIST)

| Метод и путь | Тело | Ответ |
|---|---|---|
| `GET /bank/queue` | — | `[{applicationId, number, companyName, amount, triggers: ["AMOUNT_ABOVE_2M"], waitingMinutes}]`, по ожиданию |
| `GET /bank/applications/{id}` | — | `ApplicationResponse` + `{factors: [{label, points, maxPoints}], stops: [text], limits: {WORKING_CAPITAL: 2850000, OVERDRAFT: 760000}, recommendation: {outcome, amount}, events: [...]}` |
| `GET /bank/reasons` | — | справочник причин из ML `/v1/reasons` |
| `POST /bank/applications/{id}/decision` | `{outcome: "APPROVED"\|"COUNTER_OFFER"\|"INFO_REQUESTED"\|"REJECTED", amount?, term?, reasonCode, comment}` | `204`; `reasonCode` не из справочника → `400` |

Подписи триггеров: `AMOUNT_ABOVE_2M` — «Сумма больше 2 млн», `BORDERLINE_SCORE` — «Пограничные баллы 50–59»,
`MISMATCH_UNRESOLVED` — «Расхождение не устранено», `CLIENT_DISPUTE` — «Клиент оспорил причину», `ML_UNAVAILABLE` — «Сбой автоматической оценки».

## 4. Пульт демо (роль ADMIN)

| Метод и путь | Ответ |
|---|---|
| `GET /admin/applications` | все заявки: номер, компания, сумма, `status`, `outcome`, кто решил |
| `POST /admin/demo/reset` | `204`: удалить заявки, учётки не трогать |
| `GET /admin/system` | `{backend: "ok", ml: "ok", llm: {enabled, ready, model}, policyVersion}` |

## 5. Сценарии приёмки (одинаковые для фронта, бэкенда и ML)

Сумму, срок и выручку вводит ведущий демо — так, как в карточках персон `docs/test-user-maps.md`:

| Логин | Цель · сумма · срок · выручка в месяц · личные платежи · просрочки за 2 года | Ожидаемо (проверено прогоном через ML) |
|---|---|---|
| `p1` | закупка · 850 000 · 24 · 950 000 · 20 000 · нет | предоценка `HIGH`; `approved`, `decisionMonthly 43261`, `decisionFullCost 196774` |
| `p2` | закупка · 3 000 000 · 18 · 1 900 000 · **50 000** · нет | предоценка `MEDIUM`, вилка 2 550 000–2 850 000; `specialist` → решение специалиста → `partial`, `decisionAmount 2850000`, `decisionMonthly 184575` |
| `p3` | закупка · 1 200 000 · 24 · **750 000** · 25 000 · да | предоценка `LOW`; `rejected`; маршрут S_TAX → O_DEBT (+8) → B_TURNOVER (+12), `horizonText "~3 мес."`, `projectedAmount 1100000` |
| `p4` | закупка · 500 000 · 12 · 400 000 · 10 000 · **нет** | предоценка `MEDIUM`; `rejected`; `horizonText "~8 мес., ускорить нельзя"` |
| `p5` | кассовый разрыв · 300 000 · — · **900 000** · 20 000 · нет | предоценка `MEDIUM`; `info` → загрузка выписки → `approved` 300 000, `decisionMonthly 5425` |
| `zsk` | закупка · 1 000 000 · 12 · 1 500 000 · 0 · нет | `suspended`, маршрута и помощника нет |
| `p1` открывает заявку `p2` | — | `404` |

Выручка у P3 и P5 выше, чем по счёту: на этом держатся их сценарии. У P2 личные платежи 50 000, а не 120 000 —
120 000 это платежи бизнеса, их банк берёт со счёта сам; с 120 000 предоценка P2 станет 68 баллов вместо 72. Поле выручки можно предзаполнять оборотом по
счёту, но ведущий демо вводит число из таблицы.
