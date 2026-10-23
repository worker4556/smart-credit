#!/usr/bin/env bash
# Деплой Smart Credit на сервер (Yandex Cloud или любой VPS с Ubuntu 22.04/24.04) — docs/deploy.md
#
#   scripts/deploy.sh ubuntu@51.250.1.2              # без LLM: тексты шаблонами (хватит 2 vCPU / 4 ГБ)
#   scripts/deploy.sh ubuntu@51.250.1.2 --with-llm   # с локальной LLM (нужно 8 ГБ ОЗУ)
#
# Что делает: копирует проект на сервер (rsync, без node_modules/.venv/.env), один раз ставит Docker,
# один раз создаёт .env со случайными секретами, собирает и запускает контейнеры, проверяет /health.
# Повторный запуск = обновление: код копируется заново, .env и данные базы сохраняются.
set -euo pipefail

TARGET="${1:?Укажите сервер: scripts/deploy.sh user@host [--with-llm]}"
WITH_LLM="${2:-}"
HOST="${TARGET#*@}"
REMOTE_DIR="smart-credit"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Копирую проект на $TARGET:~/$REMOTE_DIR"
rsync -az --delete \
  --exclude '.git/' --exclude 'node_modules/' --exclude '.venv/' --exclude 'dist/' \
  --exclude '__pycache__/' --exclude '.pytest_cache/' --exclude 'ml/data/' \
  --exclude 'backend/storage/' --exclude '.env' --exclude '.DS_Store' \
  "$ROOT/" "$TARGET:$REMOTE_DIR/"

echo "→ Готовлю сервер и запускаю контейнеры"
ssh "$TARGET" "HOST='$HOST' WITH_LLM='$WITH_LLM' bash -s" <<'REMOTE'
set -euo pipefail
cd ~/smart-credit

if ! command -v docker >/dev/null 2>&1; then
  echo "  Docker не найден — ставлю из репозитория Ubuntu"
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io docker-compose-v2
  sudo systemctl enable --now docker
fi
DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# .env создаётся один раз: секреты случайные и остаются на сервере, в Git их нет
if [ ! -f .env ]; then
  SITE="$(echo "$HOST" | tr '.' '-').sslip.io"     # бесплатный домен на IP → Caddy выпустит HTTPS сам
  if [ "$WITH_LLM" = "--with-llm" ]; then OLLAMA="http://llm:11434"; else OLLAMA=""; fi
  cat > .env <<ENV
SITE_ADDRESS=$SITE
CORS_ORIGINS=https://$SITE
SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_DB=smartcredit
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(openssl rand -hex 16)
ML_SERVICE_TOKEN=$(openssl rand -hex 16)
OLLAMA_URL=$OLLAMA
OLLAMA_MODEL=qwen3:1.7b
LLM_TEXT_TIMEOUT_SECONDS=30
LLM_INTENT_TIMEOUT_SECONDS=15
ENV
  chmod 600 .env
  echo "  Создан .env, адрес стенда: https://$SITE"
fi

PROFILE=""; grep -q '^OLLAMA_URL=http' .env && PROFILE="--profile llm"
$DOCKER compose -f docker-compose.yml -f docker-compose.prod.yml $PROFILE up -d --build --remove-orphans
$DOCKER image prune -f >/dev/null

echo "  Жду, пока backend станет здоровым…"
for i in $(seq 1 60); do
  if $DOCKER compose -f docker-compose.yml -f docker-compose.prod.yml ps backend | grep -q healthy; then break; fi
  sleep 5
done
$DOCKER compose -f docker-compose.yml -f docker-compose.prod.yml ps --format '  {{.Service}}: {{.Status}}'
echo "  Стенд: https://$(grep '^SITE_ADDRESS=' .env | cut -d= -f2)"
REMOTE
