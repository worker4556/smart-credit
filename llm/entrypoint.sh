#!/bin/sh
# Сервис локальной LLM: поднять Ollama, при первом запуске скачать модель, прогреть её.
# ml не ждёт этот сервис: пока модель качается, ml отвечает шаблонами (GET ml:8001/health → llm.ready = false).
set -e

MODEL="${OLLAMA_MODEL:-qwen3:1.7b}"

ollama serve &
SERVER_PID=$!

until ollama list >/dev/null 2>&1; do sleep 1; done

if ollama list | awk 'NR > 1 {print $1}' | grep -qx "$MODEL"; then
  echo "llm: модель $MODEL уже скачана"
else
  echo "llm: скачиваю $MODEL — один раз, дальше она хранится в томе llm-models"
  ollama pull "$MODEL"
fi

# Прогрев: первая загрузка весов в память занимает время — пусть это случится до первого клиента.
ollama run "$MODEL" "привет" >/dev/null 2>&1 || echo "llm: прогрев не удался, модель загрузится при первом запросе"
echo "llm: готово, модель $MODEL"

wait "$SERVER_PID"
