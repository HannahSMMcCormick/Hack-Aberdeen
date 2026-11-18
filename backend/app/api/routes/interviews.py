
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.interview_answer import InterviewAnswer
from app.models.interview_question import InterviewQuestion
from app.models.interview_session import InterviewSession
from app.models.submissions import Submission
from app.models.user import User


router = APIRouter(prefix="/interviews", tags=["Interviews"])


class StartInterviewRequest(BaseModel):
    submission_id: uuid.UUID


class SubmitAnswerRequest(BaseModel):
    question_id: uuid.UUID
    answer_text: str = Field(min_length=1, max_length=20000)


def require_candidate(user: User):
    if user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can access interviews.",
        )


def get_owned_session(
    session_id: uuid.UUID,
    db: Session,
    user: User,
) -> InterviewSession:
    session = (
        db.query(InterviewSession)
        .join(
            Submission,
            InterviewSession.submission_id == Submission.id,
        )
        .filter(
            InterviewSession.id == session_id,
            Submission.candidate_id == user.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found.",
        )

    return session


def serialize_question(question: InterviewQuestion) -> dict:
    # Do not expose the AI's internal reasoning to candidates.
    return {
        "id": str(question.id),
        "question": question.question,
        "category": question.category,
        "difficulty": question.difficulty,
        "position": question.position,
    }


@router.post("/start")
def start_interview(
    payload: StartInterviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_candidate(current_user)

    submission = (
        db.query(Submission)
        .filter(
            Submission.id == payload.submission_id,
            Submission.candidate_id == current_user.id,
        )
        .first()
    )

    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found.",
        )

    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.submission_id == submission.id,
        )
        .order_by(InterviewQuestion.position)
        .all()
    )

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generate interview questions before starting.",
        )

    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.submission_id == submission.id)
        .first()
    )

    if session is None:
        session = InterviewSession(submission_id=submission.id)
        db.add(session)

        try:
            db.commit()
            db.refresh(session)
        except IntegrityError:
            db.rollback()
            session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.submission_id == submission.id
                )
                .first()
            )
            if session is None:
                raise

    return {
        "session_id": str(session.id),
        "submission_id": str(submission.id),
        "status": session.status,
        "questions": [
            serialize_question(question)
            for question in questions
        ],
    }


@router.get("/{session_id}")
def get_interview(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_candidate(current_user)

    session = get_owned_session(
        session_id, db, current_user
    )

    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.submission_id
            == session.submission_id
        )
        .order_by(InterviewQuestion.position)
        .all()
    )

    answers = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id == session.id)
        .all()
    )

    answers_by_question = {
        answer.question_id: answer
        for answer in answers
    }

    return {
        "session_id": str(session.id),
        "status": session.status,
        "questions": [
            {
                **serialize_question(question),
                "answer": (
                    answers_by_question[question.id].answer_text
                    if question.id in answers_by_question
                    else None
                ),
            }
            for question in questions
        ],
    }


@router.post("/{session_id}/answers")
def submit_answer(
    session_id: uuid.UUID,
    payload: SubmitAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_candidate(current_user)

    session = get_owned_session(
        session_id, db, current_user
    )

    if session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview is already completed.",
        )

    if not payload.answer_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Answer cannot be empty.",
        )

    question = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.id == payload.question_id,
            InterviewQuestion.submission_id
            == session.submission_id,
        )
        .first()
    )

    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found in this interview.",
        )

    answer = (
        db.query(InterviewAnswer)
        .filter(
            InterviewAnswer.session_id == session.id,
            InterviewAnswer.question_id == question.id,
        )
        .first()
    )

    if answer is None:
        answer = InterviewAnswer(
            session_id=session.id,
            question_id=question.id,
            answer_text=payload.answer_text.strip(),
        )
        db.add(answer)
    else:
        # Allow editing answers while interview is in progress.
        answer.answer_text = payload.answer_text.strip()

    db.commit()
    db.refresh(answer)

    return {
        "answer_id": str(answer.id),
        "question_id": str(question.id),
        "saved": True,
    }


@router.post("/{session_id}/complete")
def complete_interview(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_candidate(current_user)

    session = get_owned_session(
        session_id, db, current_user
    )

    if session.status == "completed":
        return {
            "session_id": str(session.id),
            "status": "completed",
        }

    question_count = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.submission_id
            == session.submission_id
        )
        .count()
    )

    answered_count = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id == session.id)
        .count()
    )

    if question_count == 0 or answered_count < question_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Answer all questions before completing. "
                f"{answered_count}/{question_count} answered."
            ),
        )

    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "session_id": str(session.id),
        "status": "completed",
        "answered_questions": answered_count,
    }
