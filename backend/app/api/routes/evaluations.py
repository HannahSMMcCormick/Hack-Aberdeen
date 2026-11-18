
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.answer_evaluation import AnswerEvaluation
from app.models.interview_answer import InterviewAnswer
from app.models.interview_evaluation import InterviewEvaluation
from app.models.interview_question import InterviewQuestion
from app.models.interview_session import InterviewSession
from app.models.user import User
from app.services.interview_evaluator import evaluate_interview


router = APIRouter(
    prefix="/evaluations",
    tags=["Evaluations"],
)


def require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access evaluations.",
        )


def serialize_evaluation(
    db: Session,
    evaluation: InterviewEvaluation,
) -> dict:
    answer_evaluations = (
    db.query(
        AnswerEvaluation,
        InterviewAnswer,
        InterviewQuestion,
    )
    .join(
        InterviewAnswer,
        AnswerEvaluation.answer_id == InterviewAnswer.id,
    )
    .join(
        InterviewQuestion,
        InterviewAnswer.question_id == InterviewQuestion.id,
    )
    .filter(
        AnswerEvaluation.evaluation_id == evaluation.id,
        InterviewAnswer.session_id == evaluation.session_id,
    )
    .order_by(InterviewQuestion.position)
    .all()
)

    return {
        "evaluation_id": str(evaluation.id),
        "session_id": str(evaluation.session_id),
        "status": evaluation.status,
        "overall_score": evaluation.overall_score,
        "summary": evaluation.summary,
        "answer_evaluations": [
    {
        "answer_id": str(item.answer_id),
        "question_id": str(question.id),
        "question": question.question,
        "answer_text": answer.answer_text,
        "score": item.score,
        "strengths": item.strengths,
        "weaknesses": item.weaknesses,
        "feedback": item.feedback,
    }
    for item, answer, question in answer_evaluations
],
    }


@router.post("/{session_id}/generate")
def generate_evaluation(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)

    interview_session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .first()
    )

    if interview_session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found.",
        )

    if interview_session.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Interview must be completed before evaluation.",
        )

    # Reuse completed evaluations without another AI call.
    existing = (
        db.query(InterviewEvaluation)
        .filter(InterviewEvaluation.session_id == session_id)
        .first()
    )

    if existing is not None:
        if existing.status == "completed":
            return serialize_evaluation(db, existing)

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "An evaluation record already exists. "
                "It must be reviewed before retrying."
            ),
        )

    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.submission_id
            == interview_session.submission_id
        )
        .order_by(InterviewQuestion.position)
        .all()
    )

    answers = (
        db.query(InterviewAnswer)
        .filter(
            InterviewAnswer.session_id == session_id
        )
        .all()
    )

    answers_by_question = {
        answer.question_id: answer
        for answer in answers
    }

    if not questions or any(
        question.id not in answers_by_question
        for question in questions
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The interview does not have all required answers.",
        )

    question_answer_data = [
        {
            "answer_id": str(answers_by_question[question.id].id),
            "question": question.question,
            "answer_text": answers_by_question[
                question.id
            ].answer_text,
        }
        for question in questions
    ]

    # Create a pending record before calling OpenAI.
    evaluation = InterviewEvaluation(
        session_id=session_id,
        status="pending",
    )

    db.add(evaluation)

    try:
        db.commit()
        db.refresh(evaluation)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An evaluation already exists for this interview.",
        )

    try:
        result = evaluate_interview(question_answer_data)

        evaluation.overall_score = result["overall_score"]
        evaluation.summary = result["summary"]

        for item in result["answer_evaluations"]:
            db.add(
                AnswerEvaluation(
                    evaluation_id=evaluation.id,
                    answer_id=uuid.UUID(item["answer_id"]),
                    score=item["score"],
                    strengths=item["strengths"],
                    weaknesses=item["weaknesses"],
                    feedback=item["feedback"],
                )
            )

        evaluation.status = "completed"
        evaluation.completed_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(evaluation)

    except Exception:
        db.rollback()

        # Preserve the failed state so an administrator can
        # investigate before any retry incurs another API cost.
        failed_evaluation = (
            db.query(InterviewEvaluation)
            .filter(InterviewEvaluation.id == evaluation.id)
            .first()
        )

        if failed_evaluation is not None:
            failed_evaluation.status = "failed"
            db.commit()

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Evaluation failed. Check the backend logs "
                "and review the evaluation record."
            ),
        )

    return serialize_evaluation(db, evaluation)


@router.get("/{session_id}")
def get_evaluation(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)

    evaluation = (
        db.query(InterviewEvaluation)
        .filter(InterviewEvaluation.session_id == session_id)
        .first()
    )

    if evaluation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not found.",
        )

    return serialize_evaluation(db, evaluation)
