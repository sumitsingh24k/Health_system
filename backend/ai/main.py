import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.llm_service import call_llm
from services.rules_engine import apply_rules
from services.json_parser import parse_llm_json
from utils.prompt_builder import build_prompt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class Location(BaseModel):
    city: str = "Unknown"
    country: str = "Unknown"
    region: str = "Unknown"


class TimePeriod(BaseModel):
    start: str = "Unknown"
    end: str = "Unknown"


class HealthData(BaseModel):
    number_of_cases: int = 0
    disease_type: str = "Unknown"
    population_density: float = 0.0


class EnvironmentalData(BaseModel):
    temperature: float = 0.0
    humidity: float = 0.0
    rainfall_mm: float = 0.0


class InputData(BaseModel):
    location: Location = Field(default_factory=Location)
    time_period: TimePeriod = Field(default_factory=TimePeriod)
    health_data: HealthData = Field(default_factory=HealthData)
    environmental_data: EnvironmentalData = Field(default_factory=EnvironmentalData)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Health Outbreak Prediction API started")
    yield
    logger.info("Health Outbreak Prediction API shutting down")


app = FastAPI(
    title="Health Outbreak Prediction API",
    description="LLM-based health outbreak prediction using Ollama + rule engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/predict")
def predict(data: InputData):
    input_dict = data.model_dump()

    rule_output = apply_rules(input_dict)
    logger.info("Rule engine result: %s", rule_output)

    prompt = build_prompt(input_dict, rule_output)

    try:
        raw_llm_output = call_llm(prompt)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    final_output = parse_llm_json(raw_llm_output, input_dict)

    final_output["rule_engine_assessment"] = rule_output

    return final_output
