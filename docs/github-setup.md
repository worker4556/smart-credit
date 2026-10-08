# Настройка GitHub и незавершённые действия

Файлы этого PR не включают GitHub Projects, приглашения или защиту main автоматически.

## Участники
Получить четыре недостающих GitHub username и соответствие всех пяти людей ролям. Владелец приглашает именно подтверждённые аккаунты с минимальными достаточными правами. После принятия приглашений проверить доступ и обновить CODEOWNERS по фактическим зонам ответственности.
Пока указан только владелец worker4556; его роль в команде неизвестна.

## Защита main
Сначала проверить Settings → Rules → Rulesets и Branches: не заменять и не ослаблять существующие правила.
Для личного приватного репозитория поддержка enforced branch rules зависит от тарифа (GitHub Pro или выше); публичные репозитории поддерживают их на Free. Не менять видимость репозитория и не покупать тариф без решения владельца.

Целевые настройки после проверки прав и тарифа:
- Ветка `main`; запрет удаления и force push.
- Изменения только через PR; обязательное разрешение review conversations.
- После подключения второго участника: одно независимое approval, сброс устаревшего approval после новых изменений.
- После первого успешного запуска workflow: обязательный check `Repository hygiene`, источник GitHub Actions. Проверить точное имя на реальном запуске перед включением.
- CODEOWNERS review включать после распределения владельцев: единственный owner не может одобрить собственный PR. Не создавать неразрешимый bootstrap gate.
- Не добавлять автоматический bypass для агента. Перед применением правил выяснить, кто сможет завершить bootstrap PR.

Если тариф или права не позволяют enforcement, записать ограничение и соблюдать PR-процесс вручную; не называть main защищённой.

## GitHub Projects
Проверить существующие проекты и переиспользовать подходящий. Если проекта нет, создать приватный Project `Smart Credit — Hackathon`, связать с репозиторием, добавить подтверждённых участников после согласования доступа.
Колонки и поля описаны в team-workflow.md. Начальный backlog переносится в issues без выдуманных assignees. Не публиковать приватные задачи в публичный Project.

## Actions
Проверить, что Actions разрешены политикой репозитория и тарифом. Workflow не требует secrets, write permissions, cloud credentials или зависимостей приложения.
Первый CI подтверждает только минимальную гигиену. После выбора стека добавить реальные проверки; перед включением required check дождаться успешного запуска.

## Официальные справки
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
