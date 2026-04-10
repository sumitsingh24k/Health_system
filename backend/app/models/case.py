from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class SourceType(str, Enum):
    ASHA = "asha"
    MEDICAL_SHOP = "medical_shop"


class IngestionResult(BaseModel):
    id: str
    worker_id: str
    location: str
    symptoms: list[str]
    cases_count: int
    timestamp: datetime
    source: SourceType
    transcript_text: str
    basic_validation_passed: bool
    basic_validation_reasons: list[str]
    cross_validation_score: float
    cross_validation_reasons: list[str]
    trust_score: float


class TextIngestionRequest(BaseModel):
    worker_id: str = Field(min_length=1, max_length=128)
    location: str = Field(min_length=6, max_length=6)
    symptoms: list[str] = Field(min_length=1)
    cases_count: int = Field(ge=1, le=100)
    text: str = Field(min_length=1)
    timestamp: datetime | None = None

    @field_validator("location")
    @classmethod
    def validate_location(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("location must be a valid 6-digit pincode")
        return value

    @field_validator("worker_id")
    @classmethod
    def normalize_worker_id(cls, value: str) -> str:
        return value.strip()


class NormalizedRecord(BaseModel):
    worker_id: str = Field(min_length=1, max_length=128)
    location: str = Field(min_length=6, max_length=6)
    symptoms: list[str] = Field(min_length=1)
    cases_count: int = Field(ge=1, le=100)
    timestamp: datetime
    source: SourceType
    transcript_text: str = Field(min_length=1)

    @field_validator("location")
    @classmethod
    def validate_location(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("location must be a valid 6-digit pincode")
        return value

    @field_validator("symptoms")
    @classmethod
    def validate_symptoms(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip().lower() for item in value if item.strip()]
        if not cleaned:
            raise ValueError("symptoms must contain at least one non-empty value")
        return cleaned

    @field_validator("worker_id")
    @classmethod
    def normalize_worker_id(cls, value: str) -> str:
        return value.strip()
