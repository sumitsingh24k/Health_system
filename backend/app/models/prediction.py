from pydantic import BaseModel, Field


class Location(BaseModel):
    city: str = "Unknown"
    country: str = "Unknown"
    region: str = "Unknown"


class TimePeriod(BaseModel):
    start: str = "Unknown"
    end: str = "Unknown"


class HealthData(BaseModel):
    number_of_cases: int = Field(default=0, ge=0)
    disease_type: str = "Unknown"
    population_density: float = Field(default=0.0, ge=0.0)


class EnvironmentalData(BaseModel):
    temperature: float = 0.0
    humidity: float = Field(default=0.0, ge=0.0)
    rainfall_mm: float = Field(default=0.0, ge=0.0)


class PredictionRequest(BaseModel):
    location: Location = Field(default_factory=Location)
    time_period: TimePeriod = Field(default_factory=TimePeriod)
    health_data: HealthData = Field(default_factory=HealthData)
    environmental_data: EnvironmentalData = Field(default_factory=EnvironmentalData)


class CaseProjection(BaseModel):
    current: int | str = 0
    predicted_next_week: int | str = 0


class DiseasePrediction(BaseModel):
    disease: str = ""
    probability: float = Field(default=0.0, ge=0.0, le=1.0)
    reason: str = ""


class RuleEngineAssessment(BaseModel):
    base_risk: str = "LOW"
    contributing_factors: list[str] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


class PredictionResult(BaseModel):
    location: Location = Field(default_factory=Location)
    risk_level: str = "UNKNOWN"
    outbreak_status: str = "UNKNOWN"
    cases: CaseProjection = Field(default_factory=CaseProjection)
    disease_predictions: list[DiseasePrediction] = Field(default_factory=list)
    recommended_action: list[str] = Field(default_factory=list)
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    raw_llm_output: str | None = None
    rule_engine_assessment: RuleEngineAssessment
from pydantic import BaseModel, Field


class LocationInput(BaseModel):
    city: str = "Unknown"
    country: str = "Unknown"
    region: str = "Unknown"


class TimePeriodInput(BaseModel):
    start: str = "Unknown"
    end: str = "Unknown"


class HealthDataInput(BaseModel):
    number_of_cases: int = 0
    symptoms: list[str] = Field(default_factory=list)
    disease_type: str = "Unknown"
    population_density: float = 0.0


class EnvironmentalDataInput(BaseModel):
    temperature: float = 0.0
    humidity: float = 0.0
    rainfall_mm: float = 0.0


class OutbreakPredictionRequest(BaseModel):
    location: LocationInput = Field(default_factory=LocationInput)
    time_period: TimePeriodInput = Field(default_factory=TimePeriodInput)
    health_data: HealthDataInput = Field(default_factory=HealthDataInput)
    environmental_data: EnvironmentalDataInput = Field(default_factory=EnvironmentalDataInput)
