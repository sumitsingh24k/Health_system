from pydantic import BaseModel, Field, field_validator


class WorkerRegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=10, max_length=15)
    assigned_area: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("assigned_area")
    @classmethod
    def validate_pincode(cls, value: str) -> str:
        if not value.isdigit() or len(value) != 6:
            raise ValueError("assigned_area must be a valid 6-digit pincode")
        return value


class WorkerLoginRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=8, max_length=128)


class WorkerPublic(BaseModel):
    id: str
    name: str
    phone: str
    assigned_area: str
