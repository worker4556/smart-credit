FROM python:3.12.5-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.11.14 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# Только рантайм-зависимости (без dev) — версии из uv.lock
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-default-groups

COPY service ./service
COPY config ./config

RUN useradd --create-home --uid 10001 app
USER app
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8001"]
