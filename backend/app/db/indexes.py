from pymongo import ASCENDING, DESCENDING

from app.db.mongo import get_database


async def create_indexes() -> None:
    db = get_database()

    await db.ingestion_records.create_index([("location", ASCENDING), ("timestamp", DESCENDING)])
    await db.ingestion_records.create_index(
        [("location", ASCENDING), ("source", ASCENDING), ("timestamp", DESCENDING)]
    )
    await db.ingestion_records.create_index([("worker_id", ASCENDING), ("timestamp", DESCENDING)])
    await db.worker_trust.create_index("worker_id", unique=True)
