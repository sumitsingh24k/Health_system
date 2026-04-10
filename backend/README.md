# Health System Backend

FastAPI backend for case ingestion, worker auth, area-level insights, and outbreak risk signaling.

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Create `.env` from `.env.example` and update values.
4. Start server:
   - `uvicorn app.main:app --reload`

## API (v1)

- `POST /api/v1/workers/register`
- `POST /api/v1/workers/login`
- `POST /api/v1/cases` (Bearer token required)
- `GET /api/v1/cases?pincode=XXXXXX`
- `GET /api/v1/stats/area?pincode=XXXXXX`
- `GET /health`
