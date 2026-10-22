from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.api import router as api_router
from app.api.errors import field_error_handler
from app.errors import FieldError
from app.config import settings
from app.db.base import engine, init_db
from app.db.seed import seed_users
from app.services.personas import load_personas_by_key

VALIDATION_MESSAGES = {
    "Field required": "Поле обязательно",
    "Input should be a valid integer": "Ожидается целое число",
    "Input should be a valid boolean": "Ожидается true или false",
    "Input should be a valid string": "Ожидается строка",
    "String should have at least 1 character": "Поле не может быть пустым",
    "Input should be greater than 0": "Значение должно быть больше 0",
    "Input should be greater than or equal to 0": "Значение не может быть отрицательным",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_personas_by_key()  # прогрев моков
    with Session(engine) as session:
        seed_users(session)  # p1–p5, zsk, specialist, admin
    yield


app = FastAPI(
    title="Smart Credit Backend",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_exception_handler(FieldError, field_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = [
        str(part)
        for part in first.get("loc", [])
        if part not in {"body", "query", "path"}
    ]
    message = str(first.get("msg") or "Неверные данные")
    content = {"detail": VALIDATION_MESSAGES.get(message, message)}
    if loc:
        content["field"] = loc[-1]
    return JSONResponse(status_code=400, content=content)


app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
