
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InterviewEvaluation(Base):
    __tablename__ = "interview_evaluations"

    __table_args__ = (
        UniqueConstraint(
            "session_id",
            name="uq_interview_evaluations_session_id",
        ),
        CheckConstraint(
            "overall_score IS NULL OR "
            "(overall_score >= 0 AND overall_score <= 100)",
            name="ck_interview_evaluations_score",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    overall_score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    completed_at = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
