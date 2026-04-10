# Health System Backend API

Unified FastAPI backend for:
- case ingestion and trust scoring
- area-level case retrieval
- AI outbreak prediction

All API routes are served by a single application (`app.main:app`) under `/api/v1`.

## Local Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Configure environment variables (optional unless overriding defaults):
   - `MONGODB_URI` (default: `mongodb://localhost:27017`)
   - `MONGODB_DB` (default: `health_system`)
   - `OLLAMA_URL` (default: `http://localhost:11434/api/generate`)
   - `OLLAMA_MODEL` (default: `llama3.1:8b`)
   - `OLLAMA_TIMEOUT_SECONDS` (default: `120`)
4. Start Ollama and make sure the model is available:
   - `ollama serve`
   - `ollama pull llama3.1:8b`
5. Start the API:
   - `uvicorn app.main:app --reload`

## API Base URL

- Local: `http://localhost:8000`
- Versioned base: `http://localhost:8000/api/v1`

## Health Endpoint

### `GET /health`
Checks service and DB initialization state.

Example response:
```json
{
  "status": "ok",
  "database_ready": true
}
```

## Response Envelope

All `/api/v1` endpoints return:

```json
{
  "success": true,
  "message": "ok",
  "data": {}
}
```

Validation and runtime errors are returned by FastAPI with standard error shape:

```json
{
  "detail": "error message"
}
```

## Cases API

### `POST /api/v1/cases/asha/text`
Ingest ASHA text submission.

### `POST /api/v1/cases/asha`
Ingest ASHA submission via multipart form (`text` or `audio_file`).

### `POST /api/v1/cases/medical-shop/text`
Ingest medical-shop text submission.

### `POST /api/v1/cases/medical-shop`
Ingest medical-shop submission via multipart form (`text` or `audio_file`).

### `GET /api/v1/cases?location=XXXXXX&limit=50`
List recent ingested records for a pincode.

#### Example request (text ingestion)
```bash
curl -X POST "http://localhost:8000/api/v1/cases/asha/text" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "asha-12",
    "location": "560001",
    "symptoms": ["fever", "cough"],
    "cases_count": 17,
    "text": "17 people reported fever and cough in last 24h"
  }'
```

## Predictions API

### `POST /api/v1/predictions/outbreak`
Runs rules + LLM inference and returns structured outbreak prediction for dashboard consumption.

#### Request body
```json
{
  "location": {
    "city": "Bengaluru",
    "country": "India",
    "region": "Karnataka"
  },
  "time_period": {
    "start": "2026-04-01",
    "end": "2026-04-07"
  },
  "health_data": {
    "number_of_cases": 82,
    "disease_type": "Unknown",
    "population_density": 1400
  },
  "environmental_data": {
    "temperature": 33.5,
    "humidity": 74,
    "rainfall_mm": 19
  }
}
```

#### Response body (`data`)
```json
{
  "location": {
    "city": "Bengaluru",
    "country": "India",
    "region": "Karnataka"
  },
  "risk_level": "MEDIUM",
  "outbreak_status": "POSSIBLE OUTBREAK",
  "cases": {
    "current": 82,
    "predicted_next_week": 95
  },
  "disease_predictions": [
    {
      "disease": "Dengue",
      "probability": 0.72,
      "reason": "High humidity and rising case trend"
    }
  ],
  "recommended_action": [
    "Increase surveillance in hotspot areas",
    "Alert local clinics for early triage"
  ],
  "confidence_score": 0.78,
  "raw_llm_output": null,
  "rule_engine_assessment": {
    "base_risk": "MEDIUM",
    "contributing_factors": [
      "Moderate case count",
      "High population density"
    ],
    "metrics": {
      "cases": 82,
      "humidity": 74,
      "temperature": 33.5,
      "population_density": 1400
    }
  }
}
```

#### Prediction error behavior
- `503 Service Unavailable`: LLM backend unavailable (Ollama not reachable / timeout / request failure).
- `422 Unprocessable Entity`: invalid request payload.

## Dashboard Integration Notes

- Use `GET /api/v1/cases` for historical ingestion cards and recent submissions.
- Use `POST /api/v1/predictions/outbreak` for forecast/risk widgets.
- Surface `rule_engine_assessment.base_risk` as deterministic baseline and `risk_level` as LLM-refined outcome.
- Use `confidence_score` to drive confidence badges and fallback UI states.
