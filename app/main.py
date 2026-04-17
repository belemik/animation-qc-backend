from pathlib import Path
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router

BASE_DIR = Path(__file__).resolve().parents[1]

FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", BASE_DIR / "frontend"))
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", BASE_DIR / "uploads"))
PREVIEWS_DIR = Path(os.getenv("PREVIEWS_DIR", BASE_DIR / "previews"))
ANNOTATIONS_DIR = Path(os.getenv("ANNOTATIONS_DIR", BASE_DIR / "annotations"))
EXPORTS_DIR = Path(os.getenv("EXPORTS_DIR", BASE_DIR / "exports"))

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
ALLOW_CREDENTIALS = ALLOWED_ORIGINS != ["*"]

app = FastAPI(
    title="Animation QC AI",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

for directory in [UPLOADS_DIR, PREVIEWS_DIR, ANNOTATIONS_DIR, EXPORTS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/previews", StaticFiles(directory=str(PREVIEWS_DIR)), name="previews")
app.mount("/annotations", StaticFiles(directory=str(ANNOTATIONS_DIR)), name="annotations")
app.mount("/exports", StaticFiles(directory=str(EXPORTS_DIR)), name="exports")

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/health")
def health():
    return JSONResponse(
        {
            "status": "ok",
            "app": "Animation QC AI",
            "frontend_dir": str(FRONTEND_DIR),
            "uploads_dir": str(UPLOADS_DIR),
            "previews_dir": str(PREVIEWS_DIR),
            "annotations_dir": str(ANNOTATIONS_DIR),
            "exports_dir": str(EXPORTS_DIR),
        }
    )


@app.get("/")
def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse(
        {
            "status": "error",
            "message": "Frontend index.html not found",
            "expected_path": str(index_file),
        },
        status_code=500,
    )


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse(
        {
            "status": "error",
            "message": "Frontend index.html not found",
            "expected_path": str(index_file),
            "requested_path": full_path,
        },
        status_code=500,
    )