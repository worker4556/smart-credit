# ML: «Погода», словарь, помощник при отказе, LLM по умолчанию — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дополнить движок одобрения в `ml/` «Погодой», объяснением терминов и помощником при отказе на локальной LLM,
включить LLM по умолчанию в Docker и привести код, конфиги и документы к одной версии с автоматической проверкой.

**Architecture:** Вся логика — в существующем FastAPI-сервисе `ml/service`; значения — в `ml/config/*.yaml`.
LLM (Ollama) только переформулирует факты, которые посчитали правила; любой её ответ проходит `check_llm_text`, иначе
показывается шаблон. Контракт генерируется из кода в `docs/openapi-ml.yaml`, документы сверяются тестами.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, httpx, PyYAML, pytest, uv; Ollama (Docker), Qwen3 (Apache 2.0).

**Spec:** `docs/superpowers/specs/2026-10-20-ml-approval-engine-design.md`

## Global Constraints

- Все команды — из папки `ml/`: `uv run pytest …`. Все 71 существующий тест остаются зелёными после каждой задачи.
- Только модели с открытыми весами, никаких платных API.
- LLM не принимает и не меняет решение, баллы, суммы, сроки; не называет чисел и причин, которых нет на входе; не обещает одобрение.
- По 115-ФЗ (`SUSPENDED_115FZ`, `holds = NONCREDIT`) — только фиксированный текст, LLM не вызывается.
- Слово «одобрено» — только в тексте решения `APPROVED`. В наших текстах не пишем «ПСК» — пишем «полная стоимость в рублях».
- Все числа и формулировки-параметры — в `ml/config/*.yaml`, не в коде.
- Тон: отказ — тихо, без игры; срок маршрута — «ориентир, а не обещание»; «Решение принимает банк по правилам. Помощник только объясняет».
- Подпись «Погоды» дословно: «Это иллюстрация рисков, а не условия банка».
- Порог помощника: медиана ответа ≤ 30 с на MacBook Air M2 в Docker; если не проходит ни одна модель — берём самую лёгкую, LLM остаётся включённой.

## Review Focus

- Клиент спрашивает с собственным числом («а если взять 2 млн?») → модель повторяет число, которого нет в фактах → проверка отбрасывает → ответ-шаблон, не ошибка. Тест в задаче 4.
- Пустой вопрос или вопрос длиннее 500 символов → `422`, без вызова модели. Тест в задаче 4.
- Термин в другой форме слова («овердрафта», «по ЕНС») → находится по `aliases`. Тест в задаче 2.
- Ollama запущена, но модель ещё скачивается → `/health` показывает `ready: false`, все тексты — шаблоны, ответ быстрый. Тест в задаче 3.
- «Погода» для овердрафта при переданном сроке ≠ 12 → `422` с текстом из `validate_request`, а не тихий пересчёт. Тест в задаче 1.

---

### Task 1: «Погода»

**Files:**
- Modify: `ml/config/policy.yaml` (новый блок `weather`), `ml/service/schemas.py`, `ml/service/finance.py`, `ml/service/decision.py`, `ml/service/main.py`
- Test: `ml/tests/test_weather.py`

**Interfaces:**
- Produces:
  - `schemas.WeatherRow(code: Literal["BASE","RATE_UP","OVERDUE_30"], title: str, rate: float, monthly_payment: int, full_cost: int, delta_full_cost: int, note: str | None)`
  - `schemas.Weather(rows: list[WeatherRow], disclaimer: str)`
  - `finance.weather(policy, product: str, amount: int, term_months: int | None, rate: float | None = None) -> Weather`
  - поле `weather: Weather | None = None` в `Offer`, `Decision`, `Precheck`
  - `POST /v1/weather` с телом как у `/v1/quote` + необязательный `rate: float`

- [ ] **Step 1: Блок `weather` в `policy.yaml`**

```yaml
weather:
  rate_up_pp: 2.0
  overdue_days: 30
  penalty_per_day: 0.001
  disclaimer: "Это иллюстрация рисков, а не условия банка."
  titles:
    BASE: "Сейчас"
    RATE_UP: "Если ставка вырастет на 2 п.п. — например, при плавающей ставке или рефинансировании"
    OVERDUE_30: "Если задержать платёж на 30 дней"
  overdue_note: "Просрочка попадёт в кредитную историю владельца и снизит оценку при следующих заявках; просрочка больше 90 дней — стоп-фактор на 12 месяцев."
```

- [ ] **Step 2: Тесты**

```python
def test_weather_working_capital_p1(policy):
    w = weather(policy, "WORKING_CAPITAL", 850_000, 24)
    rows = {r.code: r for r in w.rows}
    assert (rows["BASE"].monthly_payment, rows["BASE"].full_cost) == (43_261, 196_774)
    assert (rows["RATE_UP"].rate, rows["RATE_UP"].monthly_payment, rows["RATE_UP"].full_cost) == (22.0, 44_096, 216_814)
    assert rows["RATE_UP"].delta_full_cost == 20_040
    assert rows["OVERDUE_30"].full_cost == 196_774 + 1_298        # пени 0,1% × 30 дней на один платёж
    assert rows["OVERDUE_30"].note.startswith("Просрочка попадёт")
    assert w.disclaimer == "Это иллюстрация рисков, а не условия банка."

def test_weather_overdraft_p5(policy):
    rows = {r.code: r for r in weather(policy, "OVERDRAFT", 300_000, None).rows}
    assert (rows["BASE"].monthly_payment, rows["BASE"].full_cost) == (5_425, 69_000)
    assert (rows["RATE_UP"].monthly_payment, rows["RATE_UP"].full_cost) == (5_918, 75_000)
    assert rows["OVERDUE_30"].full_cost == 69_000 + 9_000          # пени на весь использованный лимит

def test_weather_uses_decision_rate_and_absent_without_amount(policy):
    d = decide(policy, applicant("P2"))
    assert d.weather.rows[0].rate == d.cost.rate and d.weather.rows[0].full_cost == 500_852
    assert decide(policy, applicant("P3")).weather is None          # отказ
    assert decide(policy, applicant("P5")).weather is None          # нужны данные
    assert all(o.weather for o in offers(policy, applicant("P2"), d))

def test_weather_in_precheck(policy):
    p = precheck(policy, precheck_applicant("P1"))
    assert p.weather.rows[0].full_cost == p.cost.full_cost

def test_weather_endpoint_rejects_overdraft_term():
    r = client.post("/v1/weather", json={"product": "OVERDRAFT", "amount": 300000, "term_months": 6})
    assert r.status_code == 422 and "12 мес" in r.text
```

- [ ] **Step 3: Запустить — падают:** `uv run pytest tests/test_weather.py -v` → FAIL (`weather` не определён).
- [ ] **Step 4: Реализовать.** `weather` строит три строки через существующий `cost(...)`: `BASE` — `rate` (или ставка продукта), `RATE_UP` — `rate + rate_up_pp`, `OVERDUE_30` — `full_cost` базы + пени: для кредита `round(monthly_payment × penalty_per_day × overdue_days)`, для овердрафта `round(amount × penalty_per_day × overdue_days)`. `delta_full_cost` = разница с `BASE`. В `decide` — только при `amount` и по `cost.rate`; в `offers` — по ставке предложения; в `precheck` — по `cost.rate`. Эндпоинт вызывает `validate_request` (как `/v1/quote`).
- [ ] **Step 5: Запустить всё:** `uv run pytest -q` → все PASS.
- [ ] **Step 6: Commit** `feat(ml): weather — cost under rate rise and 30-day delay`

---

### Task 2: Словарь терминов

**Files:**
- Create: `ml/config/glossary.yaml`, `ml/service/glossary.py`
- Modify: `ml/service/config.py` (загрузка словаря), `ml/service/main.py`
- Test: `ml/tests/test_glossary.py`

**Interfaces:**
- Produces:
  - `Policy.glossary: list[dict]` — элементы `{term, aliases: list[str], plain, more}`
  - `glossary.find_terms(policy, text: str) -> list[dict]` — термины, упомянутые в тексте, без повторов, в порядке появления
  - `glossary.lookup(policy, term: str) -> dict | None` — по `term` или любому `alias`, без учёта регистра
  - `GET /v1/glossary` → `{"items": [...]}`; `GET /v1/glossary/{term}` → элемент или `404`

- [ ] **Step 1: `glossary.yaml`.** 15 терминов «Макета» с `plain` дословно из таблицы спеки (раздел 5.2) + `полная стоимость в рублях`, `предоценка`, `лимит`, `ЕНС`, `ФССП`, `115-ФЗ`, `вилка суммы`. `aliases` — формы слова (падежи, сокращения: «овердрафта», «овердрафтом»; «сальдо ЕНС», «единый налоговый счёт»). `more` — 2–3 предложения в тоне спеки. Текст про 115-ФЗ — дословно `Z_115` из `reasons.yaml`.
- [ ] **Step 2: Тесты**

```python
def test_glossary_has_maket_terms_verbatim(policy):
    assert lookup(policy, "Овердрафт")["plain"] == "Деньги сверх остатка на счёте. Платите только за дни, когда они взяты"
    assert lookup(policy, "Долговая нагрузка")["plain"] == "Какая часть дохода уходит на платежи по кредитам"
    assert len(policy.glossary) >= 22

def test_find_terms_by_alias():
    found = [t["term"] for t in find_terms(get_policy(), "Нужен лимит овердрафта, а ещё долг по ЕНС")]
    assert found == ["Лимит", "Овердрафт", "ЕНС"]

def test_glossary_endpoints():
    assert client.get("/v1/glossary").json()["items"]
    assert client.get("/v1/glossary/ОВЕРДРАФТ").status_code == 200
    assert client.get("/v1/glossary/неизвестное").status_code == 404

def test_our_texts_never_say_psk(policy):
    for t in policy.glossary:
        if t["term"] != "ПСК, переплата":
            assert "ПСК" not in t["plain"] + t["more"]
```

- [ ] **Step 3: Запустить — падают:** `uv run pytest tests/test_glossary.py -v` → FAIL.
- [ ] **Step 4: Реализовать.** `find_terms` — поиск по словам в нижнем регистре с границами слова; при совпадении нескольких терминов в одном месте берётся самый длинный.
- [ ] **Step 5: Запустить всё:** `uv run pytest -q` → PASS.
- [ ] **Step 6: Commit** `feat(ml): glossary of terms from the mockup dictionary`

---

### Task 3: LLM-клиент — таймауты, готовность, параметры для CPU

**Files:**
- Modify: `ml/service/llm.py`, `ml/service/intent.py` (передаёт таймаут разбора), `ml/service/explain.py` (таймаут текста), `ml/service/main.py` (`/health`)
- Test: `ml/tests/test_llm_client.py`

**Interfaces:**
- Produces:
  - `llm.TEXT_TIMEOUT` (env `LLM_TEXT_TIMEOUT_SECONDS`, по умолчанию 30), `llm.INTENT_TIMEOUT` (env `LLM_INTENT_TIMEOUT_SECONDS`, 15); `LLM_TIMEOUT_SECONDS` больше не читается
  - `llm.OLLAMA_MODEL` по умолчанию — выбранная модель (до задачи 6 — `qwen3:1.7b`)
  - `llm.chat(system, user, schema=None, temperature=0.1, timeout: float | None = None, max_tokens: int = 200) -> str | dict | None` — в `options`: `num_ctx: 2048`, `num_predict: max_tokens`; в теле `keep_alive: "24h"`
  - `llm.ready() -> bool` — модель есть в `GET {OLLAMA_URL}/api/tags`; результат кэшируется на 10 с; любая ошибка → `False`
  - `llm.status() -> {"enabled": bool, "ready": bool, "model": str | None}`
  - `chat` возвращает `None` без сетевого запроса, если `ready()` ложно

- [ ] **Step 1: Тесты** (Ollama подменяется `httpx.MockTransport` или monkeypatch `httpx.get/post`)

```python
def test_not_ready_while_model_downloading(monkeypatch):
    fake_tags(monkeypatch, models=[])                    # Ollama жива, модели ещё нет
    assert llm.ready() is False
    assert llm.status() == {"enabled": True, "ready": False, "model": llm.OLLAMA_MODEL}
    assert llm.chat("s", "u") is None                    # без запроса /api/chat

def test_ready_is_cached(monkeypatch):
    calls = fake_tags(monkeypatch, models=[llm.OLLAMA_MODEL])
    assert llm.ready() and llm.ready()
    assert calls.count == 1

def test_chat_sends_cpu_options(monkeypatch):
    sent = fake_chat(monkeypatch, reply="ok")
    llm.chat("s", "u", max_tokens=150, timeout=7)
    assert sent.body["options"]["num_ctx"] == 2048 and sent.body["options"]["num_predict"] == 150
    assert sent.body["keep_alive"] == "24h" and sent.timeout == 7

def test_health_reports_llm_readiness(monkeypatch):
    fake_tags(monkeypatch, models=[])
    assert client.get("/health").json()["llm"]["ready"] is False
```

- [ ] **Step 2: Запустить — падают:** `uv run pytest tests/test_llm_client.py -v` → FAIL.
- [ ] **Step 3: Реализовать.** `explain.render` и будущий помощник вызывают `chat(..., timeout=TEXT_TIMEOUT)`, `intent.parse` — `timeout=INTENT_TIMEOUT`. Фикстура в `conftest.py` сбрасывает кэш `ready()` между тестами.
- [ ] **Step 4: Запустить всё:** `uv run pytest -q` → PASS (существующие тесты с подставной LLM должны подменять и `ready`).
- [ ] **Step 5: Commit** `feat(ml): llm readiness, split timeouts, cpu-friendly options`

---

### Task 4: Помощник при отказе и нехватке

**Files:**
- Create: `ml/service/assistant.py`
- Modify: `ml/service/main.py`
- Test: `ml/tests/test_assistant.py`

**Interfaces:**
- Consumes: `glossary.find_terms`, `explain.check_llm_text(text, template, outcome)`, `llm.chat(..., timeout=llm.TEXT_TIMEOUT)`, `explain.rub`; фикстура `fake_llm` переносится из `tests/test_llm.py` в `tests/conftest.py` и дополнительно подменяет `llm.ready` на `True`
- Produces:
  - `Topic = Literal["WHY","WHAT_TO_DO","WHEN","TERM","AMOUNT","OFF_TOPIC","NONCREDIT","NOT_NEEDED"]`
  - `assistant.classify(question: str, terms: list[dict]) -> Topic`
  - `assistant.facts(policy, decision: Decision | None, route: Route | None) -> list[str]` — строки фактов: тексты причин, сумма/срок/ставка решения, шаги маршрута с `term`, `horizon_text`, `advice`
  - `assistant.answer(policy, question, decision, route, use_llm=True) -> AssistantAnswer`
  - `AssistantAnswer(answer: str, template_answer: str, source: Literal["LLM","TEMPLATE"], fallback_reason: str | None, topic: Topic, terms: list[str])`
  - `POST /v1/assistant {question: str (1–500), context: {decision?, route?}, use_llm: bool = true}`; без `decision` и `route` → `422`

Фиксированные тексты (в `reasons.yaml` или отдельном блоке конфига, не в коде):
- `NONCREDIT`: текст `Z_115` + «Маршрут к одобрению в этом случае не строится.»
- `NOT_NEEDED` (решение `APPROVED`): «Заявка одобрена — помощник нужен, если что-то пошло не так. Условия — на экране решения.»
- `OFF_TOPIC`: «Я помогаю разобраться с решением по вашей заявке и банковскими терминами. Спросите, например, почему такое решение или что можно сделать.»
- Хвост любого ответа о решении: «Решение принимает банк по правилам. Помощник только объясняет.»

- [ ] **Step 1: Тесты**

```python
def test_why_for_p3_template(policy):
    a = answer(policy, "почему мне отказали?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "WHY" and "Налоговая задолженность" in a.answer and a.source == "TEMPLATE"

def test_what_to_do_uses_route(policy):
    r = build_route(policy, applicant("P3"))
    a = answer(policy, "что мне сделать?", decide(policy, applicant("P3")), r, use_llm=False)
    assert "Погасить сальдо ЕНС" in a.answer and "~3 мес." in a.answer

def test_term_question(policy):
    a = answer(policy, "что такое долговая нагрузка?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "TERM" and "Какая часть дохода уходит на платежи по кредитам" in a.answer

def test_p4_no_shortcut(policy):
    r = build_route(policy, applicant("P4"))
    a = answer(policy, "когда можно подать снова?", decide(policy, applicant("P4")), r, use_llm=False)
    assert "ускорить нельзя" in a.answer

def test_115_never_calls_llm(policy, monkeypatch):
    monkeypatch.setattr(llm, "chat", lambda *a, **k: pytest.fail("LLM вызвана для 115-ФЗ"))
    a = answer(policy, "почему?", decide(policy, applicant("ZSK")), None)
    assert a.topic == "NONCREDIT" and a.source == "TEMPLATE"

def test_llm_answer_accepted_when_faithful(policy, fake_llm):
    fake_llm("Главная причина — налоговая задолженность. Сначала погасите сальдо ЕНС.")
    assert answer(policy, "почему отказ?", decide(policy, applicant("P3")), None).source == "LLM"

@pytest.mark.parametrize("bad", ["Возьмите 2 000 000 ₽ — так одобрят.", "Причина S_TAX.", "Гарантирую одобрение через месяц."])
def test_llm_answer_rejected(policy, fake_llm, bad):
    fake_llm(bad)
    a = answer(policy, "а если взять 2 млн?", decide(policy, applicant("P3")), None)
    assert a.source == "TEMPLATE" and a.fallback_reason

def test_off_topic(policy):
    a = answer(policy, "какая погода в Москве?", decide(policy, applicant("P3")), None, use_llm=False)
    assert a.topic == "OFF_TOPIC"

def test_endpoint_validation():
    assert client.post("/v1/assistant", json={"question": "", "context": {}}).status_code == 422
    assert client.post("/v1/assistant", json={"question": "x" * 501, "context": {}}).status_code == 422
    assert client.post("/v1/assistant", json={"question": "почему?", "context": {}}).status_code == 422
```

Слово «погода» в `test_off_topic` — специально: вопрос про погоду за окном не должен уходить в тему «Погоды» продукта.

- [ ] **Step 2: Запустить — падают:** `uv run pytest tests/test_assistant.py -v` → FAIL.
- [ ] **Step 3: Реализовать.** Порядок в `answer`: 115-ФЗ → `NONCREDIT` без LLM; `APPROVED` без маршрута → `NOT_NEEDED`; иначе `classify` → шаблон из `facts` и словаря → если `use_llm` и `llm.ready()`: системная инструкция (2–4 предложения, только по фактам, без новых чисел, причин и обещаний, без «одобрено», не по теме — вернуть к заявке) + факты + вопрос → `check_llm_text(ответ, шаблон + все факты, outcome)` → `LLM` или шаблон с `fallback_reason`.
- [ ] **Step 4: Запустить всё:** `uv run pytest -q` → PASS.
- [ ] **Step 5: Commit** `feat(ml): assistant for rejection and missing data, grounded and guarded`

---

### Task 5: LLM включена по умолчанию в Docker

**Files:**
- Modify: `docker-compose.yml`, `.env.example`, `ml/Dockerfile` (если нужен env по умолчанию)
- Test: проверка конфигурации и ручной прогон

**Interfaces:**
- Produces: `docker compose up --build` без флагов поднимает `ml`, `ollama`, одноразовый `ollama-pull`; `ml` получает `OLLAMA_URL=http://ollama:11434`, `OLLAMA_MODEL` из `.env` (по умолчанию — модель из задачи 3).

- [ ] **Step 1: Изменить compose.** У `ollama` и `ollama-pull` убрать `profiles`; `ollama-pull` после `ollama pull` делает прогревочный запрос (`ollama run "$OLLAMA_MODEL" "привет"`), `restart: "no"`; у `ml` нет `depends_on` на `ollama` (старт не ждёт модель); `OLLAMA_KEEP_ALIVE=24h` у `ollama`; лимит памяти `ollama` — 6 ГБ; образ `ollama/ollama` — с конкретным тегом, существующим на Docker Hub (проверить `docker pull`). Комментарий в шапке: как отключить LLM (`OLLAMA_URL=` в `.env`) и как указать нативную Ollama на Mac (`http://host.docker.internal:11434`).
- [ ] **Step 2: Проверить синтаксис:** `docker compose config -q` → без вывода и с кодом 0.
- [ ] **Step 3: Ручной прогон с нуля:** `docker compose down -v && docker compose up --build`. Ожидается: `ml` отвечает на `/health` сразу с `llm.ready: false`; после окончания `ollama-pull` — `ready: true` без перезапуска `ml`; `POST /v1/explain` для P3 возвращает `source: LLM` или `TEMPLATE` с `fallback_reason`, но не ошибку.
- [ ] **Step 4: Commit** `build: ollama on by default, model pulled and warmed automatically`

---

### Task 6: Замер моделей и выбор

**Files:**
- Create: `ml/eval/assistant_questions.jsonl`, `ml/eval/run_assistant.py`
- Modify: `ml/eval/run_intents.py` (печатает медиану времени), `ml/README.md` (таблица замера), `docs/decisions.md` (строка о выборе), `ml/service/llm.py` и `.env.example` (модель по умолчанию)

**Interfaces:**
- Consumes: `assistant.answer`, `intent.parse`, `explain.explain_decision`, данные `ml/fixtures/personas.json`
- Produces: `uv run python -m eval.run_assistant` печатает: долю ответов `source = LLM` (прошли проверку), долю `OFF_TOPIC` среди вопросов не по теме, медиану времени ответа; код выхода 0, если пороги пройдены

- [ ] **Step 1: Набор вопросов.** 30 строк `{"persona": "P3", "question": "...", "expect_topic": "WHY", "off_topic": false}`: P3 и P4 — по 9 (почему, что делать, когда, термины), P5 — 6 (какая выписка, зачем), P2 — 4 (почему меньше), 2 вопроса не по теме.
- [ ] **Step 2: Раннер.** Для каждого вопроса строит решение и маршрут персоны, вызывает `answer(..., use_llm=True)`, меряет время. Пороги — из спеки, раздел 5.5: принятые LLM-ответы ≥ 80%, не по теме → `OFF_TOPIC` 100%, медиана ≤ 30 с.
- [ ] **Step 3: Прогон без LLM:** `OLLAMA_URL= uv run python -m eval.run_assistant` → все ответы `TEMPLATE`, раннер не падает (проверка самого раннера).
- [ ] **Step 4: Замер на M2 в Docker** для `qwen3:1.7b`, `qwen3:4b`, `llama3.2:3b`: `OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=<model> uv run python -m eval.run_intents holdout` и `… -m eval.run_assistant`, плюс медиана `/v1/explain` для P2–P5. Выбор — самая лёгкая, прошедшая все пороги; если не прошла ни одна — `qwen3:1.7b`.
- [ ] **Step 5: Записать результат** — таблица в `ml/README.md`, строка в `docs/decisions.md`, модель по умолчанию в `llm.py`, `.env.example`, `docker-compose.yml`.
- [ ] **Step 6: Commit** `eval(ml): assistant benchmark and model choice`

---

### Task 7: Ноль расхождений — контракт, документы, инструкция бэкенду

**Files:**
- Create: `ml/service/export_openapi.py`, `docs/openapi-ml.yaml`, `ml/tests/test_docs_consistency.py`, `THIRD_PARTY_NOTICES.md`, `docs/sources/*.md`
- Modify: `docs/api-contract.md` (раздел C), `docs/decisions.md`, `ml/README.md`, `backend/INSTRUCTIONS.md`

**Interfaces:**
- Consumes: всё из задач 1–6
- Produces: `uv run python -m service.export_openapi` перезаписывает `../docs/openapi-ml.yaml` (YAML, ключи отсортированы)

- [ ] **Step 1: Тесты согласованности**

```python
def test_openapi_file_is_current():
    assert yaml.safe_load(OPENAPI_FILE.read_text()) == app.openapi()   # иначе: перегенерируй export_openapi

def test_contract_section_c_mentions_every_endpoint():
    paths = set(app.openapi()["paths"])
    section_c = api_contract_section("C")
    assert {p for p in paths if p.startswith("/v1/")} <= set(re.findall(r"/v1/[a-z/{}]+", section_c))

def test_backend_instructions_use_existing_ml_paths():
    used = set(re.findall(r"ml\s*(?:POST|GET)?\s*`?(/v1/[a-z]+)", BACKEND_MD))
    assert used and used <= {p.split("{")[0].rstrip("/") for p in app.openapi()["paths"]}

def test_numbers_in_docs_match_policy(policy):
    wc, od = policy.products["WORKING_CAPITAL"], policy.products["OVERDRAFT"]
    for doc in (DECISIONS_MD, ML_README, BACKEND_MD):
        assert f"{wc['min_term']}–{wc['max_term']} мес" in doc
    assert f"{od['rate']:g}%" in ML_README and f"{wc['rate']:g}%" in ML_README

def test_backend_timeouts_match_design():
    assert "timeout=40" in BACKEND_MD and "timeout=20" not in BACKEND_MD
    assert "--profile llm" not in BACKEND_MD
```

- [ ] **Step 2: Запустить — падают:** `uv run pytest tests/test_docs_consistency.py -v` → FAIL.
- [ ] **Step 3: Сгенерировать** `docs/openapi-ml.yaml` командой из Interfaces.
- [ ] **Step 4: Обновить раздел C** `docs/api-contract.md`: `/v1/weather`, поле `weather` в предоценке, предложениях и решении, `/v1/glossary`, `/v1/assistant`, `/health` с `ready`, ссылка на `docs/openapi-ml.yaml` как на машиночитаемый источник.
- [ ] **Step 5: Обновить `backend/INSTRUCTIONS.md`:**
  - шаг 5 — `timeout=40` для `/v1/explain` и `/v1/assistant`, 20 для `/v1/intent`, 5 для остальных;
  - шаг 6 — эндпоинты бэкенда `POST /applications/{id}/assistant {question, useLlm}` (бэк сам подставляет сохранённые решение и маршрут) и `GET /glossary`, `GET /glossary/{term}`;
  - шаг 7 — `weather` в `precheck`, в каждой карточке `goalOffers` и в ApplicationView (`decisionWeather`);
  - шаг 9 — помощник на экранах отказа и «Нужны данные»: сначала `useLlm: false`, затем `true` с подменой;
  - шаг 10 — `ollama` всегда в compose, без профиля; `/admin/system` показывает `llm.ready`;
  - сохранить уже внесённые локально правки (вход по логину и паролю, `422`, надбавка к ставке).
- [ ] **Step 6: Обновить `docs/decisions.md`** (п. 13: «кредит 3–36 мес.»; «Погода»: +2 п.п., пени 0,1% в день × 30 дней; помощник без истории и без потоковой передачи; LLM по умолчанию и выбор модели) и `ml/README.md` (новые эндпоинты, «Погода», словарь, помощник, LLM по умолчанию, требования: 8 ГБ ОЗУ, ~2 ГБ диска, время первого запуска; формулировка «модели передаются тексты, построенные из кодов и параметров по справочнику»).
- [ ] **Step 7: `THIRD_PARTY_NOTICES.md`** — раздел ML: Ollama (MIT), выбранная модель и её лицензия, FastAPI, Pydantic, httpx, PyYAML, uvicorn (версии из `uv.lock`); смоделированные интеграции: ЕГРЮЛ/ЕГРИП, «Прозрачный бизнес», ФССП, арбитраж, БКИ, ЗСК, счёт в Альфе. Остальные разделы оставить пустыми заголовками для бэкенда и фронта.
- [ ] **Step 8: `docs/sources/`** — текстовые выдержки: `textutil -convert txt` для шести docx из `~/Desktop/alfabanck/` и «Комментарии.docx», `pdftotext` для кейса; по файлу `.md` на документ, в шапке — исходное имя и дата.
- [ ] **Step 9: Запустить всё:** `uv run pytest -q` → PASS, включая `test_docs_consistency.py`.
- [ ] **Step 10: Commit** `docs: single contract for ml — openapi export, synced docs and backend instructions`

---

### Task 8: Комплект для жюри — README «Для жюри», рабочие материалы отдельно, куски ML для аналитиков

**Files:**
- Modify: `README.md` (корень)
- Move (`git mv`): `docs/superpowers/` → `docs/team/superpowers/`, `docs/team-tasks.md` → `docs/team/team-tasks.md`, `backend/INSTRUCTIONS.md` → `docs/team/backend-instructions.md`, `docs/sources/` → `docs/team/sources/`
- Create: `docs/team/README.md`, `docs/team/ml-for-analysts.md`
- Modify: `ml/tests/test_docs_consistency.py` (новые пути), все ссылки на перенесённые файлы

**Interfaces:**
- Consumes: всё из задач 1–7
- Produces: корневой `README.md` с разделом «Для жюри»; `docs/team/` — всё, что не часть сдачи

- [ ] **Step 1: Перенести рабочие материалы** командами `git mv` (история сохраняется). В шапке каждого перенесённого `.md` и в `docs/team/README.md` — строка: «Рабочие материалы команды, не часть сдачи. Для проверки — корневой README, раздел „Для жюри“».
- [ ] **Step 2: Обновить ссылки.** `grep -rn "superpowers/\|team-tasks\|backend/INSTRUCTIONS\|docs/sources" --include=*.md --include=*.py .` → все пути ведут на новые места; тесты задачи 7 читают файлы по новым путям.
- [ ] **Step 3: Раздел «Для жюри» в `README.md`** (сразу после первого абзаца):
  - запуск: `git clone …` → `cp .env.example .env` → `docker compose up --build` → `http://localhost:3000`; требования: Docker, 8 ГБ ОЗУ, ~2 ГБ диска под модель; первый запуск скачивает модель, пока она качается — тексты шаблонные, всё работает;
  - тестовые учётные записи (пароль `demo`): `p1`…`p5`, `zsk`, `specialist`, `admin` — с одной строкой, что покажет каждая;
  - сценарий проверки на 5–7 минут: P1 (одобрение) → P2 (иные условия у специалиста) → P3 (отказ, маршрут, «Пересчитать», помощник) → кабинет специалиста;
  - ссылки только на обязательные документы кейса (стр. 7): архитектура, описание API и OpenAPI, коллекция запросов, диаграмма статусов, модель данных, тест-сценарии, THIRD_PARTY_NOTICES, `docs/decisions.md`. Документы, которых ещё нет (их делают аналитики и бэкенд), — строкой «готовится», без битых ссылок.
- [ ] **Step 4: `docs/team/ml-for-analysts.md`** — готовые куски для README и питча: схема «одна модель → предоценка, решение, причины, маршрут» (mermaid), таблица 9 факторов с баллами, порядок правил решения, таблица сценариев P1–P5 и ЗСК с ожидаемыми цифрами, «Погода» и помощник с границами LLM, «что ИИ никогда не делает».
- [ ] **Step 5: Проверить:** `uv run pytest -q` (из `ml/`) → PASS; `grep -rn "](docs/superpowers\|](backend/INSTRUCTIONS" .` → пусто.
- [ ] **Step 6: Commit** `docs: jury entry in README, team materials moved to docs/team`
