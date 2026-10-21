# Локальная LLM с открытыми весами для Smart Credit. Используется только сервисом ml.
# Модель вшивается в образ при сборке: после запуска она готова сразу, интернет больше не нужен.
FROM ollama/ollama:0.12.6

ARG OLLAMA_MODEL=qwen3:1.7b
ENV OLLAMA_MODEL=${OLLAMA_MODEL} \
    OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_KEEP_ALIVE=24h

# Скачать веса в слой образа (~1,4 ГБ для qwen3:1.7b)
RUN ollama serve >/tmp/ollama-build.log 2>&1 & \
    SERVER_PID=$!; \
    until ollama list >/dev/null 2>&1; do sleep 1; done; \
    ollama pull "$OLLAMA_MODEL" && kill "$SERVER_PID"

COPY entrypoint.sh /usr/local/bin/llm-entrypoint.sh
RUN chmod +x /usr/local/bin/llm-entrypoint.sh

EXPOSE 11434
# Здоров = сервер отвечает и модель на месте
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD ollama list | awk 'NR > 1 {print $1}' | grep -qx "$OLLAMA_MODEL" || exit 1
ENTRYPOINT ["/usr/local/bin/llm-entrypoint.sh"]
