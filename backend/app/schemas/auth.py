from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PreferredLanguage = Literal["en", "fr", "ar", "es"]


# ---------- Requests ----------
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120, description="User's full name.")
    email: EmailStr = Field(description="Account email (unique).")
    password: str = Field(min_length=8, max_length=128, description="Password, 8+ characters.")
    company_name: str | None = Field(default=None, max_length=255, description="Company or store name (optional).")
    preferred_language: PreferredLanguage = Field(default="en", description="UI language preference.")

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(description="Account email to send a reset link to.")


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, description="Single-use reset token from the email link.")
    new_password: str = Field(min_length=8, max_length=128, description="New password, 8+ characters.")


class UpdatePreferencesRequest(BaseModel):
    preferred_language: PreferredLanguage = Field(description="UI language for this account.")


# ---------- Responses ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str | None
    company_name: str | None
    preferred_language: str = "en"
    role: str = "MEMBER"
    status: str = "ACTIVE"
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut