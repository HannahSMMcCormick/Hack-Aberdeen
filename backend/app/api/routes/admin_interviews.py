
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.assessments import Assessment
from app.models.interview_evaluation import InterviewEvaluation
from app.models.interview_session import InterviewSession
from app.models.submissions import Submission
from app.models.user import User


router = APIRouter(
    prefix="/admin/interviews",
    tags=["Admin Interviews"],
)


@router.get("")
def list_admin_interviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can view interview results.",
        )

    rows = (
        db.query(
            InterviewSession,
            Submission,
            Assessment,
            User,
            InterviewEvaluation,
        )
        .join(
            Submission,
            InterviewSession.submission_id == Submission.id,
        )
        .join(
            Assessment,
            Submission.assessment_id == Assessment.id,
        )
        .join(
            User,
            Submission.candidate_id == User.id,
        )
        .outerjoin(
            InterviewEvaluation,
            InterviewEvaluation.session_id == InterviewSession.id,
        )
        .order_by(InterviewSession.started_at.desc())
        .all()
    )

    return [
        {
            "session_id": str(session.id),
            "submission_id": str(submission.id),
            "candidate_name": candidate.full_name,
            "candidate_email": candidate.email,
            "assessment_title": assessment.title,
            "project_filename": submission.original_filename,
            "interview_status": session.status,
            "started_at": session.started_at.isoformat(),
            "completed_at": (
                session.completed_at.isoformat()
                if session.completed_at
                else None
            ),
            "evaluation_status": (
                evaluation.status
                if evaluation is not None
                else "not_started"
            ),
            "overall_score": (
                evaluation.overall_score
                if evaluation is not None
                else None
            ),
        }
        for (
            session,
            submission,
            assessment,
            candidate,
            evaluation,
        ) in rows
    ]
