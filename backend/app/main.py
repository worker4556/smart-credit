from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.api import router as api_router
from app.config import settings
from app.db.base import engine, init_db
from app.db.seed import seed_users
from app.services.personas import load_personas_by_key


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

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
