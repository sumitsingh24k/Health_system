from fastapi import APIRouter, Query

from app.models.stats import AreaStatsResponse
from app.services.stats_service import get_area_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/area", response_model=AreaStatsResponse)
async def area_stats(
    pincode: str = Query(..., min_length=6, max_length=6),
) -> AreaStatsResponse:
    stats = await get_area_stats(pincode)
    return AreaStatsResponse(**stats)
