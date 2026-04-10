from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "health_system"

    max_cases_per_submission: int = 100
    max_symptoms_per_submission: int = 10
    cross_validation_window_hours: int = 24
    max_case_delta_ratio: float = 0.7

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
