
import os
import uuid
import zipfile
from pathlib import Path, PurePosixPath

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

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.assessments import Assessment
from app.models.submissions import Submission
from app.models.user import User

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

    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise

    finally:
        file.file.close()
