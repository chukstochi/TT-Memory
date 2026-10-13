import uuid
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import Base, engine, get_db
from app.models import User, Memory
from app.schemas import RegisterIn, LoginIn, UserOut, TokenOut, PresignIn, PresignOut, MemoryCreate, MemoryOut
from app.security import hash_password, verify_password, create_access_token, current_user
from app.storage import r2_client, ALLOWED_TYPES

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}

@app.post("/api/v1/auth/register", response_model=UserOut, status_code=201)
async def register(data: RegisterIn, db: AsyncSession = Depends(get_db)):
    email = data.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email is already registered")
    user = User(name=data.name.strip(), email=email, password_hash=hash_password(data.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@app.post("/api/v1/auth/login", response_model=TokenOut)
async def login(data: LoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    return TokenOut(access_token=create_access_token(user.id))

@app.get("/api/v1/users/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return user

@app.post("/api/v1/uploads/presign", response_model=PresignOut)
async def presign(data: PresignIn, user: User = Depends(current_user)):
    if data.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type is not supported")
    if data.file_size > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds the upload limit")
    suffix = data.filename.rsplit(".", 1)[-1].lower() if "." in data.filename else "bin"
    key = f"users/{user.id}/memories/{uuid.uuid4()}.{suffix}"
    try:
        client = r2_client()
        url = client.generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.r2_bucket_name, "Key": key, "ContentType": data.content_type},
            ExpiresIn=settings.r2_presign_expire_seconds,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return PresignOut(upload_url=url, object_key=key, expires_in=settings.r2_presign_expire_seconds)

@app.post("/api/v1/memories", response_model=MemoryOut, status_code=201)
async def create_memory(data: MemoryCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not data.object_key.startswith(f"users/{user.id}/memories/"):
        raise HTTPException(status_code=403, detail="This upload does not belong to your account")
    if data.media_type not in {"photo", "video", "audio"}:
        raise HTTPException(status_code=422, detail="media_type must be photo, video, or audio")
    if data.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type is not supported")
    memory = Memory(owner_id=user.id, **data.model_dump())
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return memory

@app.get("/api/v1/memories", response_model=list[MemoryOut])
async def list_memories(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Memory).where(Memory.owner_id == user.id).order_by(Memory.created_at.desc())
    )
    return list(result.scalars().all())
