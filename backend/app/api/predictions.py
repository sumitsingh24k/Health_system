from fastapi import APIRouter, HTTPException, status

from app.models.api import ApiResponse
from app.models.prediction import PredictionRequest, PredictionResult
from app.services.prediction_service import LLMUnavailableError, predict_outbreak

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.post("/outbreak", response_model=ApiResponse[PredictionResult])
async def predict_outbreak_risk(payload: PredictionRequest) -> ApiResponse[PredictionResult]:
    try:
        result = predict_outbreak(payload)
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return ApiResponse(data=result)
