from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.database import check_db_health

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
def get_health():
    """Health check endpoint to verify backend, database, and AI operational status."""
    db_ok = check_db_health()
    gemini_ready = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here")

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": "connected" if db_ok else "disconnected",
        "gemini_configured": gemini_ready,
        "gemini_model": settings.GEMINI_MODEL,
        "fallback_model": settings.FALLBACK_GEMINI_MODEL,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
