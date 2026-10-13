from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    created_at: datetime
    model_config = {"from_attributes": True}

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PresignIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str
    file_size: int = Field(gt=0)

class PresignOut(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int

class MemoryCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    description: str | None = None
    media_type: str
    original_filename: str
    content_type: str
    object_key: str
    file_size: int = Field(gt=0)
    taken_at: datetime | None = None

class MemoryOut(BaseModel):
    id: str
    title: str
    description: str | None
    media_type: str
    original_filename: str
    content_type: str
    object_key: str
    file_size: int
    taken_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}
