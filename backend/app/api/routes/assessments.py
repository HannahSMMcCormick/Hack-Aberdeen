
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_admin
from app.core.database import get_db
from app.models.assessments import Assessment
from app.models.user import User
from app.schemas.assessments import (
    AssessmentCreate,
    AssessmentUpdate,
    AssessmentResponse,
)


router = APIRouter(
    prefix="/assessments",
    tags=["Assessments"],
    dependencies=[Depends(require_admin)],
)


@router.post(
    "",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_assessment(
    data: AssessmentCreate,
    db: Session = Depends(get_db),
):
    assessment = Assessment(
        **data.model_dump(),
        status="draft",
    )

    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    return assessment


@router.get("", response_model=list[AssessmentResponse])
def list_assessments(
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Assessment).order_by(Assessment.created_at.desc())
    ).all()


@router.get("/{assessment_id}", response_model=AssessmentResponse)
def get_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found",
        )

    return assessment


@router.patch("/{assessment_id}", response_model=AssessmentResponse)
def update_assessment(
    assessment_id: uuid.UUID,
    data: AssessmentUpdate,
    db: Session = Depends(get_db),
):
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found",
        )

    updates = data.model_dump(exclude_unset=True)

    for field in ("title", "role", "criteria", "status"):
        if field in updates and updates[field] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null",
            )

    for field, value in updates.items():
        setattr(assessment, field, value)

    db.commit()
    db.refresh(assessment)

    return assessment


@router.delete(
    "/{assessment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found",
        )

    db.delete(assessment)
    db.commit()
