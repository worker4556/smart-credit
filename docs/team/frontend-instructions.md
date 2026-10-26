# Задание фронтенду: подключаемся к бэкенду по контракту

> Рабочие материалы команды, не часть сдачи. **Все формы запросов и ответов — в [contract.md](contract.md)**, здесь —
> что поменять в коде. Файл можно целиком отдать ИИ-ассистенту вместе с `contract.md`.

**Главное правило:** фронт ничего не считает и ничего не решает. Платёж, шанс, предложения, причины, маршрут,
«Погода», тексты приходят с бэкенда готовыми. Данные компании и персоны — тоже с бэкенда, не из кода фронта.

## 1. Вход

Авторизация выполняется только через бэкенд. `LoginPage` принимает логин и пароль, `App.tsx` вызывает
`api.login(login, password)`, сохраняет `accessToken` через `saveToken` и использует профиль `user` из ответа.
При `401` токен очищается, а пользователю показывается сообщение бэкенда («Неверный логин или пароль»).
Локальной проверки паролей и мастер-пароля на фронтенде нет.

Роли: `CLIENT` → кабинет, `SPECIALIST` → `/bank`, `ADMIN` → `/admin`. Любой ответ `401` очищает токен и возвращает
пользователя к экрану входа.

## 2. Персона = учётная запись, переключателя нет

- В шапке нет переключателя персон. Сменить учётную запись можно после выхода и повторного входа.
- Локальные демо-аккаунты и данные персон во фронтенде не используются; `data/demoAccounts.ts` удалён. Компания
  загружается из `GET /me` (`user.company`), остальные сведения клиент вводит сам. Подсказки ведущему демо хранить в
  таблице сценариев README, а не в приложении.
- P6 (бухгалтер) не входит в MVP.
- `lookupCompany` запрашивает компанию у бэкенда: на `404` показывается «Компания не найдена среди ваших», остальные
  ошибки передаются пользователю. Не добавлять локальный запасной источник данных.
- После входа черновик создаётся через `POST /applications` с данными профиля (`user.company`, если есть), без
  подстановки сценариев персон.

## 3. Имена и формы полей — привести к контракту

| Где | Сейчас | По контракту |
|---|---|---|
| `types.ts → Company` | `legal_form`, `registration_year`, `account.average_monthly_turnover` | `legalForm`, `registrationYear`, `averageMonthlyTurnover` (camelCase, плоско) |
| `types.ts → Quote` | `{monthly, total, rate, disclaimer}` | + `fullCost`, `termMonths` |
| `types.ts → LoanOffer` | `amount: string \| number`, `detail`, `chance: string` | `{product, name, amount: number, termMonths, rate, monthly, fullCost, why, chance: "HIGH"\|"MEDIUM"\|"LOW", weather}` — строки «850 000 ₽ на 24 месяца» собирает фронт через `formatMoney` |
| `types.ts → Precheck` | `{amountLow, amountHigh, chance, reasons, text, disclaimer, goalOffers}` | + `requestedAmount`, `ownerNote`, `validUntil`, `weather` |
| `types.ts → RouteStep` | `{id, action, term, done}` | `{code, action, term, pointsGain, done, bkiDelayBusinessDays?}` |
| `types.ts → ApplicationRoute` | `{steps, horizon_text, disclaimer}` | `{status, holds, basedOn, steps, horizonText, message, advice, projectedAmount, disclaimer, text}` |
| `api.ts → recalculateRoute` | тело `{done: [...]}` | `{doneSteps: [...]}` — коды шагов (`step.code`) |
| `ApplicationResponse` | — | + `number`, `status`, `decisionTerm`, `decisionFullCost`, `decisionWeather`, `infoRequest`, `routeAvailable`, `assistantAvailable` |
| `api.ts` (новое) | — | `intent(text)`, `assistant(id, question, useLlm)`, `glossary()`, `decline(id)`, `sign(id)`, `withdraw(id)` |

`Outcome` у вас уже правильный: `review | specialist | approved | partial | info | rejected | suspended`.

## 4. Экраны

| Экран | Что поменять |
|---|---|
| `GoalPage` — фраза (новое, Must: история US-02) | Карточка «Пока не знаю, подскажите» открывает поле **«Опишите, что нужно, своими словами»** и кнопку «Разобрать» → `POST /intent {text}`. Пока ждём (до 20 с) — «Разбираем задачу…». Ответ подставить: выделить карточку `goal`, выставить ползунки `amount` и `term`, сверху — «Проверьте, правильно ли мы поняли»; поля из `missing` подсветить. Клиент подтверждает или правит — **автоматически дальше не переходить**. Ошибка или пустой ответ — остаётся обычная форма, без сообщения об ошибке |
| `AmountPage` | Платёж и переплата — из `POST /quote` (уже так). Для цели «Перекрыть кассовый разрыв» ползунок срока **скрыть** (овердрафт всегда 12 мес.). Ошибку `400` показывать под суммой (уже так) |
| `FinancePage` | Вопрос о кредитах: **«Сколько вы лично платите по кредитам и кредиткам в месяц?»** — нужны личные платежи владельца, кредиты бизнеса банк видит по счёту сам. Вопрос о просрочках: **«Были ли просрочки по кредитам за 2 года, включая закрытые?»** («включая закрытые» — из карточки P4). Выручку в месяц можно предзаполнить `company.averageMonthlyTurnover`, но поле редактируемое |
| `FinancePage` → залог | Вопрос оставить или убрать — решают аналитики; в расчёт он не идёт |
| `OffersPage` | Блок предоценки над карточками: **вилка** `amountLow – amountHigh` (не точное число), шанс словом, причины, `text`, `ownerNote`, **подпись `disclaimer`**. Карточки — из `goalOffers`. Блок «Погода» — строки `weather.rows` и `weather.disclaimer` |
| `ReviewPage` | Без обеих галочек кнопка неактивна (бэкенд всё равно ответит `400`) |
| `StatusPage` | Опрос `GET /applications/{id}` раз в 3 с, пока `outcome` = `review` или `specialist` (сейчас только `review`). Для `specialist` — «Заявку рассматривает специалист», без срока. Убрать «Обычно отвечаем в течение рабочего дня», если ещё осталось |
| `StatusPage` → решение | `approved`: сумма, `decisionMonthly`, `decisionFullCost`, «Погода», «Принять» / «Отказаться». `partial`: «Хотели X — можем Y»; если сумма та же, а ставка выше — показать ставку. `info`: `infoRequest.text`, срок, загрузка файла. `rejected`: `decisionText`, причины, «Открыть маршрут». `suspended`: **только `decisionText`**, без маршрута, без помощника, без анимации |
| `StatusPage` → маршрут | Шаги — точки на тропе: `action`, `term`, `+pointsGain`; у шагов с `bkiDelayBusinessDays` — подпись «кредитная история обновится примерно через 2 рабочих дня». Чекбокс → `recalculate({doneSteps})`. `horizonText` крупно, рядом `disclaimer`. `status = READY` → кнопка «Подать новую заявку». `NO_ROUTE` → только `message`. `advice` — отдельной плашкой |
| Помощник (новое) | На `rejected`, `partial`, `info`: поле «Спросите, что непонятно». Сначала `assistant(id, q, false)` — ответ сразу; затем `assistant(id, q, true)` — подменить текст, если `source = "LLM"`. Для `suspended` поле не показывать |
| Термины (новое) | `GET /glossary` один раз; подчёркивать термины в текстах решения и маршрута; по клику — `plain` и `more` |

## 5. Формулировки — нельзя менять

- Предоценка: «Это оценка по текущим данным, а не решение банка. Действует 30 дней» — приходит в `disclaimer`.
- «Одобрено» — только на экране `approved`.
- Не писать «ПСК» — писать «полная стоимость в рублях».
- Срок решения банка не называть.
- Маршрут: «ориентир, а не обещание» — приходит в `disclaimer`.

## 6. Сборка

`Dockerfile` и `nginx.conf` уже правильные: nginx отдаёт сборку и проксирует `/api` на `backend:8000`.
В `docker-compose.yml` у `frontend` добавить `depends_on: backend` (сам `backend` добавляет бэкендер).
Для `npm run dev` прокси в `vite.config.ts` на `http://localhost:8000` уже есть.

## 7. Готово, когда

Сценарии из [contract.md, раздел 5](contract.md#5-сценарии-приёмки-одинаковые-для-фронта-бэкенда-и-ml) проходят
через интерфейс после `docker compose up --build`: вход `p1` / `demo`, 8 экранов, одобрение 43 261 ₽ в месяц и
полная стоимость 196 774 ₽; `p3` — отказ, маршрут ~3 мес., пересчёт по чекбоксам; `zsk` — приостановка без маршрута.
