
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


AssessmentStatus = Literal["draft", "published"]


class AssessmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    role: str = Field(min_length=1, max_length=255)
    description: str | None = None
    criteria: dict[str, Any] = Field(default_factory=dict)


class AssessmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    criteria: dict[str, Any] | None = None
    status: AssessmentStatus | None = None


class AssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    role: str
    description: str | None
    criteria: dict[str, Any]
    status: str
    created_at: datetime
