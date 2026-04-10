from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PatientInfo(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    age: int = Field(ge=0, le=120)
    gender: str = Field(min_length=1, max_length=20)


class CaseCreateRequest(BaseModel):
    patient: PatientInfo
    symptoms: list[str] = Field(min_length=1)
    suspected_disease: str = Field(min_length=2, max_length=100)
    location: Coordinates
    pincode: str = Field(min_length=6, max_length=6)

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, value: str) -> str:
        if not value.isdigit() or len(value) != 6:
            raise ValueError("pincode must be a valid 6-digit pincode")
        return value


class CaseResponse(BaseModel):
    id: str
    pincode: str
    suspected_disease: str
    reported_by: str
    timestamp: datetime
    location_mismatch: bool
