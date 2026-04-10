from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile, status

from app.config import settings
from app.db.mongo import get_database
from app.models.case import NormalizedRecord, SourceType


def _parse_symptoms(raw: str | list[str]) -> list[str]:
    if isinstance(raw, list):
        items = [item.strip().lower() for item in raw]
        return [item for item in items if item]
    items = [item.strip().lower() for item in raw.split(",")]
    return [item for item in items if item]


async def _extract_text(text: str | None, audio_file: UploadFile | None) -> str:
    if text and text.strip():
        return text.strip()
    if audio_file is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either text or audio_file must be provided",
        )
    payload = await audio_file.read()
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="audio_file is empty",
        )
    try:
        transcript = payload.decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Audio transcription is unavailable for non-text audio streams",
        ) from exc
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to extract text from input",
        )
    return transcript


def _basic_validation(record: NormalizedRecord) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if record.cases_count > settings.max_cases_per_submission:
        reasons.append("cases_count exceeds configured threshold")
    if len(record.symptoms) > settings.max_symptoms_per_submission:
        reasons.append("too many symptoms in one submission")
    return (len(reasons) == 0, reasons)


async def _cross_validation(record: NormalizedRecord) -> tuple[float, list[str]]:
    db = get_database()
    window_start = record.timestamp - timedelta(hours=settings.cross_validation_window_hours)
    counterpart_source = (
        SourceType.MEDICAL_SHOP.value
        if record.source == SourceType.ASHA
        else SourceType.ASHA.value
    )
    counterpart = await db.ingestion_records.find_one(
        {
            "location": record.location,
            "timestamp": {"$gte": window_start, "$lte": record.timestamp},
            "source": counterpart_source,
        },
        sort=[("timestamp", -1)],
    )
    if counterpart is None:
        return 0.5, ["no counterpart submission in window"]

    denominator = max(record.cases_count, counterpart["cases_count"], 1)
    diff_ratio = abs(record.cases_count - counterpart["cases_count"]) / denominator
    symptom_overlap = set(record.symptoms).intersection(counterpart.get("symptoms", []))
    score = max(0.0, min(1.0, (1.0 - diff_ratio) * 0.7 + (0.3 if symptom_overlap else 0.0)))

    reasons: list[str] = []
    if diff_ratio > settings.max_case_delta_ratio:
        reasons.append("cases_count mismatch with counterpart source")
    if not symptom_overlap:
        reasons.append("no symptom overlap with counterpart source")
    if not reasons:
        reasons.append("submission aligns with counterpart source")
    return score, reasons


async def _update_trust_score(
    worker_id: str,
    basic_passed: bool,
    cross_validation_score: float,
    timestamp: datetime,
) -> float:
    db = get_database()
    trust_doc = await db.worker_trust.find_one({"worker_id": worker_id})
    current_score = float(trust_doc["trust_score"]) if trust_doc else 0.5

    if not basic_passed:
        updated_score = current_score * 0.7
    else:
        updated_score = (current_score * 0.6) + (cross_validation_score * 0.4)

    updated_score = max(0.0, min(1.0, round(updated_score, 4)))
    await db.worker_trust.update_one(
        {"worker_id": worker_id},
        {"$set": {"trust_score": updated_score, "updated_at": timestamp}},
        upsert=True,
    )
    return updated_score


async def _ingest(
    source: SourceType,
    worker_id: str,
    location: str,
    symptoms_raw: str | list[str],
    cases_count: int,
    text: str | None,
    audio_file: UploadFile | None,
    timestamp: datetime,
) -> dict:
    transcript_text = await _extract_text(text=text, audio_file=audio_file)
    normalized = NormalizedRecord(
        worker_id=worker_id,
        location=location,
        symptoms=_parse_symptoms(symptoms_raw),
        cases_count=cases_count,
        timestamp=timestamp.astimezone(timezone.utc),
        source=source,
        transcript_text=transcript_text,
    )
    basic_validation_passed, basic_validation_reasons = _basic_validation(normalized)
    cross_validation_score, cross_validation_reasons = await _cross_validation(normalized)
    trust_score = await _update_trust_score(
        worker_id=normalized.worker_id,
        basic_passed=basic_validation_passed,
        cross_validation_score=cross_validation_score,
        timestamp=normalized.timestamp,
    )

    db = get_database()
    doc = normalized.model_dump()
    doc["basic_validation"] = {
        "passed": basic_validation_passed,
        "reasons": basic_validation_reasons,
    }
    doc["cross_validation"] = {
        "score": cross_validation_score,
        "reasons": cross_validation_reasons,
    }
    doc["trust_score"] = trust_score

    result = await db.ingestion_records.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "worker_id": doc["worker_id"],
        "location": doc["location"],
        "symptoms": doc["symptoms"],
        "cases_count": doc["cases_count"],
        "timestamp": doc["timestamp"],
        "source": doc["source"],
        "transcript_text": doc["transcript_text"],
        "basic_validation_passed": basic_validation_passed,
        "basic_validation_reasons": basic_validation_reasons,
        "cross_validation_score": cross_validation_score,
        "cross_validation_reasons": cross_validation_reasons,
        "trust_score": trust_score,
    }


async def ingest_asha_submission(
    worker_id: str,
    location: str,
    symptoms_raw: str | list[str],
    cases_count: int,
    text: str | None,
    audio_file: UploadFile | None,
    timestamp: datetime,
) -> dict:
    return await _ingest(
        source=SourceType.ASHA,
        worker_id=worker_id,
        location=location,
        symptoms_raw=symptoms_raw,
        cases_count=cases_count,
        text=text,
        audio_file=audio_file,
        timestamp=timestamp,
    )


async def ingest_medical_shop_submission(
    worker_id: str,
    location: str,
    symptoms_raw: str | list[str],
    cases_count: int,
    text: str | None,
    audio_file: UploadFile | None,
    timestamp: datetime,
) -> dict:
    return await _ingest(
        source=SourceType.MEDICAL_SHOP,
        worker_id=worker_id,
        location=location,
        symptoms_raw=symptoms_raw,
        cases_count=cases_count,
        text=text,
        audio_file=audio_file,
        timestamp=timestamp,
    )


async def list_records_by_location(location: str, limit: int = 50) -> list[dict]:
    if not location.isdigit() or len(location) != 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid location")
    db = get_database()
    cursor = db.ingestion_records.find({"location": location}).sort("timestamp", -1).limit(limit)
    records: list[dict] = []
    async for doc in cursor:
        records.append(
            {
                "id": str(doc["_id"]),
                "worker_id": doc["worker_id"],
                "location": doc["location"],
                "symptoms": doc["symptoms"],
                "cases_count": doc["cases_count"],
                "timestamp": doc["timestamp"],
                "source": doc["source"],
                "transcript_text": doc["transcript_text"],
                "basic_validation_passed": doc["basic_validation"]["passed"],
                "basic_validation_reasons": doc["basic_validation"]["reasons"],
                "cross_validation_score": doc["cross_validation"]["score"],
                "cross_validation_reasons": doc["cross_validation"]["reasons"],
                "trust_score": doc["trust_score"],
            }
        )
    return records
