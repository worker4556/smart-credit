from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/smartcredit"
    ML_URL: str = "http://localhost:8001"
    CORS_ORIGINS: str = "http://localhost:5173"
    STORAGE_PATH: str = "storage/uploads"
    SECRET_KEY: str = "change-me-in-production-smartcredit-demo-key"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
