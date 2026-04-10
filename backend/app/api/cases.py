from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_worker_id
from app.models.case import CaseCreateRequest, CaseResponse
from app.services.case_service import create_case, get_cases_by_area

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def add_case(
    payload: CaseCreateRequest,
    worker_id: str = Depends(get_current_worker_id),
) -> CaseResponse:
    case = await create_case(payload, worker_id)
    return CaseResponse(**case)


@router.get("", response_model=list[CaseResponse])
async def list_cases_by_area(
    pincode: str = Query(..., min_length=6, max_length=6),
    limit: int = Query(50, ge=1, le=200),
) -> list[CaseResponse]:
    cases = await get_cases_by_area(pincode=pincode, limit=limit)
    return [CaseResponse(**case) for case in cases]
