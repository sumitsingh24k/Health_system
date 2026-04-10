from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.config import settings
from app.db.mongo import get_database


def _risk_level(total_cases: int) -> str:
    if total_cases >= settings.outbreak_critical_threshold:
        return "critical"
    if total_cases >= settings.outbreak_warning_threshold:
        return "warning"
    return "normal"


async def get_area_stats(pincode: str) -> dict:
    db = get_database()

    if not pincode.isdigit() or len(pincode) != 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pincode")

    now = datetime.now(timezone.utc)
    last_24h_start = now - timedelta(hours=24)
    previous_24h_start = now - timedelta(hours=48)

    total_cases = await db.cases.count_documents({"pincode": pincode})
    last_24h_cases = await db.cases.count_documents(
        {"pincode": pincode, "timestamp": {"$gte": last_24h_start}}
    )
    previous_24h_cases = await db.cases.count_documents(
        {
            "pincode": pincode,
            "timestamp": {"$gte": previous_24h_start, "$lt": last_24h_start},
        }
    )

    pipeline = [
        {"$match": {"pincode": pincode}},
        {"$group": {"_id": "$suspected_disease", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    disease_counts = [
        {"disease": row["_id"], "count": row["count"]}
        async for row in db.cases.aggregate(pipeline)
    ]

    if previous_24h_cases == 0:
        growth_rate_percent = 100.0 if last_24h_cases > 0 else 0.0
    else:
        growth_rate_percent = ((last_24h_cases - previous_24h_cases) / previous_24h_cases) * 100

    return {
        "pincode": pincode,
        "total_cases": total_cases,
        "disease_counts": disease_counts,
        "last_24h_cases": last_24h_cases,
        "previous_24h_cases": previous_24h_cases,
        "growth_rate_percent": round(growth_rate_percent, 2),
        "risk_level": _risk_level(total_cases),
    }
