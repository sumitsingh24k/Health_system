from pydantic import BaseModel, Field, field_validator


class Location(BaseModel):
    city: str = "Unknown"
    country: str = "Unknown"
    region: str = "Unknown"


class TimePeriod(BaseModel):
    start: str = "Unknown"
    end: str = "Unknown"


class MedicineSale(BaseModel):
    medicine: str = "Unknown"
    units_sold: int = Field(default=0, ge=0)
    unit_price: float = Field(default=0.0, ge=0.0)
    benchmark_price: float | None = Field(default=None, ge=0.0)

    @field_validator("medicine")
    @classmethod
    def normalize_medicine(cls, value: str) -> str:
        cleaned = (value or "").strip()
        return cleaned or "Unknown"


class HealthData(BaseModel):
    number_of_cases: int = Field(default=0, ge=0)
    symptoms: list[str] = Field(default_factory=list)
    disease_type: str = "Unknown"
    population_density: float = Field(default=0.0, ge=0.0)
    historical_cases: list[int] = Field(default_factory=list)

    @field_validator("symptoms")
    @classmethod
    def normalize_symptoms(cls, value: list[str]) -> list[str]:
        return [item.strip().lower() for item in value if item and item.strip()]


class EnvironmentalData(BaseModel):
    temperature: float = 0.0
    humidity: float = Field(default=0.0, ge=0.0)
    rainfall_mm: float = Field(default=0.0, ge=0.0)


class MedicalData(BaseModel):
    sales: list[MedicineSale] = Field(default_factory=list)
    historical_total_units: list[int] = Field(default_factory=list)


class PredictionRequest(BaseModel):
    location: Location = Field(default_factory=Location)
    time_period: TimePeriod = Field(default_factory=TimePeriod)
    health_data: HealthData = Field(default_factory=HealthData)
    environmental_data: EnvironmentalData = Field(default_factory=EnvironmentalData)
    medical_data: MedicalData = Field(default_factory=MedicalData)


class CaseProjection(BaseModel):
    current: int | str = 0
    predicted_next_week: int | str = 0
    predicted_next_3_days: int | str = 0


class DiseasePrediction(BaseModel):
    disease: str = ""
    probability: float = Field(default=0.0, ge=0.0, le=1.0)
    reason: str = ""


class MedicineDemandPrediction(BaseModel):
    medicine: str = ""
    expected_units_next_3_days: int = Field(default=0, ge=0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class RuleEngineAssessment(BaseModel):
    base_risk: str = "LOW"
    risk_score: float = Field(default=0.0, ge=0.0, le=100.0)
    outbreak_probability_next_3_days: float = Field(default=0.0, ge=0.0, le=1.0)
    contributing_factors: list[str] = Field(default_factory=list)
    inferred_diseases: list[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


class PredictionResult(BaseModel):
    location: Location = Field(default_factory=Location)
    risk_level: str = "UNKNOWN"
    risk_score: float = Field(default=0.0, ge=0.0, le=100.0)
    outbreak_probability_next_3_days: float = Field(default=0.0, ge=0.0, le=1.0)
    outbreak_status: str = "UNKNOWN"
    cases: CaseProjection = Field(default_factory=CaseProjection)
    disease_predictions: list[DiseasePrediction] = Field(default_factory=list)
    medicine_demand_next_3_days: list[MedicineDemandPrediction] = Field(default_factory=list)
    smart_alerts: list[str] = Field(default_factory=list)
    recommended_action: list[str] = Field(default_factory=list)
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    raw_llm_output: str | None = None
    rule_engine_assessment: RuleEngineAssessment


# Backward-compatible aliases used by older clients.
class LocationInput(Location):
    pass


class TimePeriodInput(TimePeriod):
    pass


class HealthDataInput(HealthData):
    pass


class EnvironmentalDataInput(EnvironmentalData):
    pass


class OutbreakPredictionRequest(PredictionRequest):
    pass
