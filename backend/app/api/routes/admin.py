from fastapi import APIRouter, Depends

from app.api.dependencies import require_admin
from app.models.user import User


router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
)


@router.get("/dashboard")
def admin_dashboard(
    current_user: User = Depends(require_admin),
):
    return {
        "message": "Welcome to the admin dashboard",
        "email": current_user.email,
        "role": current_user.role,
    }