
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnswerEvaluation(Base):
    __tablename__ = "answer_evaluations"

    __table_args__ = (
        UniqueConstraint(
            "evaluation_id",
            "answer_id",
            name="uq_answer_evaluations_evaluation_answer",
        ),
        CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_answer_evaluations_score",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "interview_evaluations.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    answer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "interview_answers.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    strengths: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    weaknesses: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    feedback: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
