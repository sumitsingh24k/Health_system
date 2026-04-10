from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.db.mongo import get_database
from app.models.worker import WorkerRegisterRequest
from app.utils.security import create_access_token, hash_password, verify_password


async def register_worker(payload: WorkerRegisterRequest) -> dict:
    db = get_database()

    worker_doc = {
        "name": payload.name,
        "phone": payload.phone,
        "assigned_area": payload.assigned_area,
        "password_hash": hash_password(payload.password),
    }

    try:
        result = await db.workers.insert_one(worker_doc)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Worker already exists with this phone number",
        ) from exc

    return {
        "id": str(result.inserted_id),
        "name": payload.name,
        "phone": payload.phone,
        "assigned_area": payload.assigned_area,
    }


async def login_worker(phone: str, password: str) -> str:
    db = get_database()

    worker = await db.workers.find_one({"phone": phone})
    if worker is None or not verify_password(password, worker["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone or password",
        )

    return create_access_token(str(worker["_id"]))
