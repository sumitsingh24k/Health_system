from pymongo import ASCENDING, DESCENDING

from app.db.mongo import get_database


async def create_indexes() -> None:
    db = get_database()

    await db.workers.create_index("phone", unique=True)
    await db.workers.create_index("assigned_area")

    await db.cases.create_index([("pincode", ASCENDING), ("timestamp", DESCENDING)])
    await db.cases.create_index([("suspected_disease", ASCENDING), ("timestamp", DESCENDING)])
    await db.cases.create_index("reported_by")
    await db.cases.create_index("timestamp")

    await db.case_submission_logs.create_index(
        [("worker_id", ASCENDING), ("submitted_at", DESCENDING)]
    )
    await db.alerts.create_index([("pincode", ASCENDING), ("disease", ASCENDING)], unique=True)
    await db.alerts.create_index("status")
