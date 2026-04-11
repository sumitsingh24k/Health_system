from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.cases import router as cases_router
from app.api.predictions import router as predictions_router
from app.db.indexes import create_indexes
from app.db.mongo import mongodb

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_ready = False
    mongodb.connect()
    try:
        await create_indexes()
        app.state.db_ready = True
    except Exception:
        logger.exception("MongoDB initialization failed; running in degraded mode")
    yield
    mongodb.disconnect()


app = FastAPI(title="JanSetu API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    db_ready = bool(getattr(app.state, "db_ready", False))
    return {
        "status": "ok" if db_ready else "degraded",
        "database_ready": db_ready,
    }


app.include_router(cases_router, prefix="/api/v1")
app.include_router(predictions_router, prefix="/api/v1")
