from fastapi import APIRouter, status

from app.models.auth import TokenResponse
from app.models.worker import WorkerLoginRequest, WorkerPublic, WorkerRegisterRequest
from app.services.auth_service import login_worker, register_worker

router = APIRouter(prefix="/workers", tags=["workers"])


@router.post("/register", response_model=WorkerPublic, status_code=status.HTTP_201_CREATED)
async def register(payload: WorkerRegisterRequest) -> WorkerPublic:
    worker = await register_worker(payload)
    return WorkerPublic(**worker)


@router.post("/login", response_model=TokenResponse)
async def login(payload: WorkerLoginRequest) -> TokenResponse:
    token = await login_worker(phone=payload.phone, password=payload.password)
    return TokenResponse(access_token=token)
