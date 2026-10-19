"""Подбор кредитного продукта под задачу клиента (правила, без обучения)."""
from __future__ import annotations

PRODUCTS = {
    "WORKING_CAPITAL": {"name": "Кредит на пополнение оборотных средств", "min_amount": 300_000, "max_amount": 10_000_000, "min_term": 6, "max_term": 36},
    "EQUIPMENT": {"name": "Кредит на оборудование", "min_amount": 500_000, "max_amount": 20_000_000, "min_term": 12, "max_term": 60},
    "OVERDRAFT": {"name": "Овердрафт", "min_amount": 100_000, "max_amount": 3_000_000, "min_term": 12, "max_term": 12},
    "CREDIT_LINE": {"name": "Кредитная линия", "min_amount": 1_000_000, "max_amount": 30_000_000, "min_term": 12, "max_term": 36},
}

# purpose → [(product, why)] в порядке приоритета
RULES: dict[str, list[tuple[str, str]]] = {
    "EQUIPMENT": [
        ("EQUIPMENT", "Создан для покупки оборудования: срок до 5 лет и самая низкая ставка — платёж меньше."),
        ("WORKING_CAPITAL", "Подойдёт, если оборудование недорогое и вы хотите погасить быстрее."),
    ],
    "WORKING_CAPITAL": [
        ("WORKING_CAPITAL", "Пополнение оборотных средств: закупка товара, сырья, зарплаты."),
        ("CREDIT_LINE", "Если деньги нужны частями — берёте по мере необходимости и платите проценты только за использованное."),
    ],
    "CASH_GAP": [
        ("OVERDRAFT", "Закрывает кассовый разрыв автоматически: деньги доступны прямо на счёте, гасится поступлениями."),
        ("CREDIT_LINE", "Если разрыв крупный или повторяется — лимит, которым можно пользоваться многократно."),
    ],
    "CONTRACT": [
        ("CREDIT_LINE", "Для исполнения контракта: транши под этапы работ, проценты только за использованное."),
        ("WORKING_CAPITAL", "Если нужна вся сумма сразу на закупку под контракт."),
    ],
    "EXPANSION": [
        ("WORKING_CAPITAL", "Запуск нового направления: товар, аренда, команда."),
        ("EQUIPMENT", "Если для расширения нужно в первую очередь оборудование."),
    ],
    "OTHER": [
        ("WORKING_CAPITAL", "Универсальный кредит на текущие нужды бизнеса."),
        ("CREDIT_LINE", "Гибкий лимит, если сумма и сроки потребности пока не ясны."),
    ],
}


def recommend(purpose: str, amount: int, term_months: int) -> list[dict]:
    items: list[dict] = []
    for idx, (code, reason) in enumerate(RULES.get(purpose, RULES["OTHER"])):
        p = PRODUCTS[code]
        notes = []
        if amount < p["min_amount"]:
            notes.append(f"минимальная сумма — {p['min_amount']:,} ₽".replace(",", " "))
        if amount > p["max_amount"]:
            notes.append(f"максимальная сумма — {p['max_amount']:,} ₽".replace(",", " "))
        if not p["min_term"] <= term_months <= p["max_term"]:
            notes.append(f"срок {p['min_term']}–{p['max_term']} мес")
        fits = not notes
        items.append({
            "product_code": code,
            "name": p["name"],
            "fit": "BEST" if idx == 0 and fits else "ALTERNATIVE",
            "reason": reason + (f" Учтите: {', '.join(notes)}." if notes else ""),
            "fits_request": fits,
        })
    # Если лучший по задаче продукт не подходит по параметрам, а альтернатива подходит — поднимаем её
    if items and not items[0]["fits_request"]:
        for it in items[1:]:
            if it["fits_request"]:
                it["fit"] = "BEST"
                items.remove(it)
                items.insert(0, it)
                break
    return items
