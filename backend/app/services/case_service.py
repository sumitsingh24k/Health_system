from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException, status

from app.config import settings
from app.db.mongo import get_database
from app.models.case import CaseCreateRequest


async def create_case(payload: CaseCreateRequest, worker_id: str) -> dict:
    db = get_database()

    worker = await db.workers.find_one({"_id": ObjectId(worker_id)})
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=settings.case_rate_window_minutes)
    submissions_count = await db.case_submission_logs.count_documents(
        {
            "worker_id": worker_id,
            "submitted_at": {"$gte": window_start},
        }
    )
    if submissions_count >= settings.case_rate_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Case submission rate limit exceeded",
        )

    location_mismatch = payload.pincode != worker["assigned_area"]

    case_doc = {
        "patient": payload.patient.model_dump(),
        "symptoms": payload.symptoms,
        "suspected_disease": payload.suspected_disease.strip().lower(),
        "location": payload.location.model_dump(),
        "pincode": payload.pincode,
        "reported_by": worker_id,
        "timestamp": now,
        "location_mismatch": location_mismatch,
    }

    result = await db.cases.insert_one(case_doc)
    await db.case_submission_logs.insert_one({"worker_id": worker_id, "submitted_at": now})

    disease_count = await db.cases.count_documents(
        {
            "pincode": payload.pincode,
            "suspected_disease": case_doc["suspected_disease"],
        }
    )
    if disease_count >= settings.outbreak_warning_threshold:
        status_value = (
            "critical"
            if disease_count >= settings.outbreak_critical_threshold
            else "warning"
        )
        await db.alerts.update_one(
            {
                "pincode": payload.pincode,
                "disease": case_doc["suspected_disease"],
            },
            {
                "$set": {
                    "count": disease_count,
                    "status": status_value,
                    "updated_at": now,
                }
            },
            upsert=True,
        )

    return {
        "id": str(result.inserted_id),
        "pincode": case_doc["pincode"],
        "suspected_disease": case_doc["suspected_disease"],
        "reported_by": case_doc["reported_by"],
        "timestamp": case_doc["timestamp"],
        "location_mismatch": case_doc["location_mismatch"],
    }


async def get_cases_by_area(pincode: str, limit: int = 50) -> list[dict]:
    db = get_database()

    if not pincode.isdigit() or len(pincode) != 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pincode")

    cursor = db.cases.find({"pincode": pincode}).sort("timestamp", -1).limit(limit)
    cases: list[dict] = []
    async for doc in cursor:
        cases.append(
            {
                "id": str(doc["_id"]),
                "pincode": doc["pincode"],
                "suspected_disease": doc["suspected_disease"],
                "reported_by": doc["reported_by"],
                "timestamp": doc["timestamp"],
                "location_mismatch": doc.get("location_mismatch", False),
            }
        )
    return cases
