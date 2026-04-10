from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI

from app.api.cases import router as cases_router
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


app = FastAPI(title="Health System API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    db_ready = bool(getattr(app.state, "db_ready", False))
    return {
        "status": "ok" if db_ready else "degraded",
        "database_ready": db_ready,
    }


app.include_router(cases_router, prefix="/api/v1")
