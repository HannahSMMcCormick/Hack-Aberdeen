
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.auth import router as auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.submissions import router as submissions_router

app = FastAPI(
    title="Personify Interview",
    description="Backend API for the project-based AI interview platform",
    version="0.1.0"
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(assessments_router)
app.include_router(submissions_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/")
def root():
    return {
        "message": "Personify Interview Platform API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }
