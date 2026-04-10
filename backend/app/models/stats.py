from pydantic import BaseModel


class DiseaseCount(BaseModel):
    disease: str
    count: int


class AreaStatsResponse(BaseModel):
    pincode: str
    total_cases: int
    disease_counts: list[DiseaseCount]
    last_24h_cases: int
    previous_24h_cases: int
    growth_rate_percent: float
    risk_level: str
