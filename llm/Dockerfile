# Локальная LLM с открытыми весами для Smart Credit. Используется только сервисом ml.
FROM ollama/ollama:0.12.6

ENV OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_KEEP_ALIVE=24h \
    OLLAMA_MODEL=qwen3:1.7b

COPY entrypoint.sh /usr/local/bin/llm-entrypoint.sh
RUN chmod +x /usr/local/bin/llm-entrypoint.sh

EXPOSE 11434
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD ollama list >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/llm-entrypoint.sh"]
