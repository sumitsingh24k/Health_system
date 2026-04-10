from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.mongo import get_database
from app.utils.security import decode_access_token

security = HTTPBearer(auto_error=True)


async def get_current_worker_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    token = credentials.credentials
    worker_id = decode_access_token(token)
    if worker_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if not ObjectId.is_valid(worker_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    db = get_database()

    exists = await db.workers.count_documents({"_id": ObjectId(worker_id)}, limit=1)
    if exists == 0:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return worker_id
