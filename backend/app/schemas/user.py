from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime



class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str
    role: str = Field("technicien", pattern="^(admin|manager|technicien)$")


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72,
                          description="Mot de passe (8-72 caractères)")


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None
