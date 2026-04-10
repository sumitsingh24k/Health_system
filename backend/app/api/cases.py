from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.models.api import ApiResponse
from app.models.case import IngestionResult, TextIngestionRequest
from app.services.case_service import (
    ingest_asha_submission,
    ingest_medical_shop_submission,
    list_records_by_location,
)

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post(
    "/asha/text",
    response_model=ApiResponse[IngestionResult],
    status_code=status.HTTP_201_CREATED,
)
async def ingest_asha_text(payload: TextIngestionRequest) -> ApiResponse[IngestionResult]:
    result = await ingest_asha_submission(
        worker_id=payload.worker_id,
        location=payload.location,
        symptoms_raw=payload.symptoms,
        cases_count=payload.cases_count,
        text=payload.text,
        audio_file=None,
        timestamp=payload.timestamp or datetime.now(timezone.utc),
    )
    return ApiResponse(data=IngestionResult(**result))


@router.post(
    "/asha", response_model=ApiResponse[IngestionResult], status_code=status.HTTP_201_CREATED
)
async def ingest_asha(
    worker_id: str = Form(...),
    location: str = Form(...),
    symptoms: str = Form(...),
    cases_count: int = Form(...),
    text: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    timestamp: datetime | None = Form(default=None),
) -> ApiResponse[IngestionResult]:
    result = await ingest_asha_submission(
        worker_id=worker_id,
        location=location,
        symptoms_raw=symptoms,
        cases_count=cases_count,
        text=text,
        audio_file=audio_file,
        timestamp=timestamp or datetime.now(timezone.utc),
    )
    return ApiResponse(data=IngestionResult(**result))


@router.post(
    "/medical-shop/text",
    response_model=ApiResponse[IngestionResult],
    status_code=status.HTTP_201_CREATED,
)
async def ingest_medical_shop_text(payload: TextIngestionRequest) -> ApiResponse[IngestionResult]:
    result = await ingest_medical_shop_submission(
        worker_id=payload.worker_id,
        location=payload.location,
        symptoms_raw=payload.symptoms,
        cases_count=payload.cases_count,
        text=payload.text,
        audio_file=None,
        timestamp=payload.timestamp or datetime.now(timezone.utc),
    )
    return ApiResponse(data=IngestionResult(**result))


@router.post(
    "/medical-shop",
    response_model=ApiResponse[IngestionResult],
    status_code=status.HTTP_201_CREATED,
)
async def ingest_medical_shop(
    worker_id: str = Form(...),
    location: str = Form(...),
    symptoms: str = Form(...),
    cases_count: int = Form(...),
    text: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    timestamp: datetime | None = Form(default=None),
) -> ApiResponse[IngestionResult]:
    result = await ingest_medical_shop_submission(
        worker_id=worker_id,
        location=location,
        symptoms_raw=symptoms,
        cases_count=cases_count,
        text=text,
        audio_file=audio_file,
        timestamp=timestamp or datetime.now(timezone.utc),
    )
    return ApiResponse(data=IngestionResult(**result))


@router.get("", response_model=ApiResponse[list[IngestionResult]])
async def list_by_location(
    location: str = Query(..., min_length=6, max_length=6),
    limit: int = Query(50, ge=1, le=200),
) -> ApiResponse[list[IngestionResult]]:
    records = await list_records_by_location(location=location, limit=limit)
    return ApiResponse(data=[IngestionResult(**record) for record in records])
