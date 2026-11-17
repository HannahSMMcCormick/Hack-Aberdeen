
import os
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from sqlalchemy.exc import IntegrityError

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.services.project_analyser import analyse_project
from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.assessments import Assessment
from app.models.submissions import Submission
from app.models.user import User
from app.models.interview_question import InterviewQuestion
from app.services.question_generator import generate_interview_questions

router = APIRouter(prefix="/submissions", tags=["Submissions"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_FILES = 1000

# Private storage, outside the frontend/public directory.
STORAGE_DIR = Path(__file__).resolve().parents[3] / "private_uploads"


def validate_zip(path: Path) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()

            if not entries or len(entries) > MAX_FILES:
                raise ValueError("ZIP is empty or contains too many entries.")

            total_size = 0

            for entry in entries:
                name = entry.filename.replace("\\", "/")
                parts = PurePosixPath(name).parts

                if (
                    name.startswith("/")
                    or ".." in parts
                    or not name
                    or ":" in name
                ):
                    raise ValueError("Unsafe ZIP entry path.")

                # Reject Unix symbolic links and special files.
                if entry.create_system == 3:
                    mode = (entry.external_attr >> 16) & 0o170000
                    if mode not in (0, 0o100000, 0o040000):
                        raise ValueError("ZIP contains an unsafe file type.")

                if entry.flag_bits & 0x1:
                    raise ValueError("Encrypted ZIP files are not supported.")

                total_size += entry.file_size

                if total_size > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError("ZIP contents exceed the size limit.")

            # Verify CRCs and decompression without extracting files.
            bad_file = archive.testzip()

            if bad_file is not None:
                raise ValueError("ZIP contains a corrupted file.")

    except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
        raise ValueError("Invalid or unsupported ZIP file.") from exc


@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload_submission(
    assessment_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=403,
            detail="Only candidates can upload projects.",
        )

    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found.",
        )

    if assessment.status != "published":
        raise HTTPException(
            status_code=400,
            detail="Assessment is not published.",
        )
        
        
    # Prevent candidates from submitting twice to the same assessment.
    existing_submission = (
        db.query(Submission)
        .filter(
            Submission.candidate_id == current_user.id,
            Submission.assessment_id == assessment_id,
        )
        .first()
    )

    if existing_submission is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted a project for this assessment.",
        )

    original_name = Path(
        (file.filename or "").replace("\\", "/")
    ).name

    if (
        not original_name.lower().endswith(".zip")
        or len(original_name) > 255
    ):
        raise HTTPException(
            status_code=400,
            detail="Upload a ZIP file with a valid filename.",
        )

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    submission_id = uuid.uuid4()
    storage_key = f"{submission_id}.zip"
    destination = STORAGE_DIR / storage_key

    try:
        # Exclusive creation avoids accidentally overwriting a file.
        with destination.open("xb") as output:
            total = 0

            while chunk := file.file.read(1024 * 1024):
                total += len(chunk)

                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Maximum ZIP size is 20 MB.",
                    )

                output.write(chunk)

        try:
            validate_zip(destination)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=str(exc),
            ) from exc

        submission = Submission(
            id=submission_id,
            candidate_id=current_user.id,
            assessment_id=assessment_id,
            original_filename=original_name,
            storage_key=storage_key,
            status="pending",
        )

        db.add(submission)
        db.commit()
        db.refresh(submission)

        return {
            "id": str(submission.id),
            "assessment_id": str(submission.assessment_id),
            "original_filename": submission.original_filename,
            "status": submission.status,
        }

    except IntegrityError as exc:
        db.rollback()
        destination.unlink(missing_ok=True)

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted a project for this assessment.",
        ) from exc

    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise

    finally:
        file.file.close()


@router.get("/assessments")
def get_candidate_assessments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=403,
            detail="Only candidates can view available assessments.",
        )

    assessments = (
        db.query(Assessment)
        .filter(Assessment.status == "published")
        .order_by(Assessment.created_at.desc())
        .all()
    )

    return [
        {
            "id": str(assessment.id),
            "title": assessment.title,
            "role": assessment.role,
            "description": assessment.description,
            "status": assessment.status,
            "created_at": assessment.created_at,
        }
        for assessment in assessments
    ]


@router.get("/mine")
def get_my_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=403,
            detail="Only candidates can view their submissions.",
        )

    submissions = (
        db.query(Submission)
        .filter(Submission.candidate_id == current_user.id)
        .order_by(Submission.created_at.desc())
        .all()
    )

    return [
        {
            "id": str(submission.id),
            "assessment_id": str(submission.assessment_id),
            "original_filename": submission.original_filename,
            "status": submission.status,
            "created_at": submission.created_at,
        }
        for submission in submissions
    ]


@router.post("/{submission_id}/analyze")
def analyze_submission(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only candidates can analyze their projects.
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can analyze projects.",
        )

    # Look up the submission and enforce ownership.
    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
            Submission.candidate_id == current_user.id,
        )
        .first()
    )

    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found.",
        )

    if not submission.storage_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission ZIP file is missing.",
        )

    # Construct the path using only the trusted submission ID.
    zip_path = STORAGE_DIR / f"{submission.id}.zip"

    if not zip_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission ZIP file was not found.",
        )

    try:
        analysis = analyse_project(zip_path)
    except (OSError, ValueError, zipfile.BadZipFile):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not analyze the uploaded ZIP file.",
        )

    # Don't return raw source-code samples to the client.
    return {
        "submission_id": str(submission.id),
        "original_filename": submission.original_filename,
        "analysis": {
            "total_files": analysis["total_files"],
            "languages": analysis["languages"],
            "frameworks": analysis["frameworks"],
            "file_tree": analysis["file_tree"],
        },
    }


@router.post("/{submission_id}/generate-questions")
def generate_submission_questions(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can generate questions.",
        )

    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
            Submission.candidate_id == current_user.id,
        )
        .first()
    )

    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found.",
        )

    existing_questions = (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.submission_id == submission_id)
        .order_by(InterviewQuestion.position)
        .all()
    )

    if existing_questions:
        return {
            "submission_id": str(submission_id),
            "already_generated": True,
            "questions": [
                {
                    "id": str(item.id),
                    "question": item.question,
                    "category": item.category,
                    "difficulty": item.difficulty,
                    "reason": item.reason,
                    "position": item.position,
                }
                for item in existing_questions
            ],
        }

    if not submission.storage_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission ZIP file is missing.",
        )

    zip_path = STORAGE_DIR / f"{submission.id}.zip"

    if not zip_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission ZIP file was not found.",
        )

    try:
        analysis = analyse_project(zip_path)
        generated = generate_interview_questions(analysis)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not analyze the project or generate valid questions.",
        ) from exc

    saved_questions = []

    try:
        for position, item in enumerate(generated, start=1):
            question = InterviewQuestion(
                submission_id=submission_id,
                question=item["question"],
                category=item["category"],
                difficulty=item["difficulty"],
                reason=item["reason"],
                position=position,
            )

            db.add(question)
            saved_questions.append(question)

        db.commit()

        for question in saved_questions:
            db.refresh(question)

    except Exception:
        db.rollback()
        raise

    return {
        "submission_id": str(submission_id),
        "already_generated": False,
        "questions": [
            {
                "id": str(item.id),
                "question": item.question,
                "category": item.category,
                "difficulty": item.difficulty,
                "reason": item.reason,
                "position": item.position,
            }
            for item in saved_questions
        ],
    }

@router.get("/{submission_id}/questions")
def get_submission_questions(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can view their questions.",
        )

    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
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
        .filter(InterviewQuestion.submission_id == submission_id)
        .order_by(InterviewQuestion.position)
        .all()
    )

    return {
        "submission_id": str(submission_id),
        "questions": [
            {
                "id": str(item.id),
                "question": item.question,
                "category": item.category,
                "difficulty": item.difficulty,
                "reason": item.reason,
                "position": item.position,
            }
            for item in questions
        ],
    }
