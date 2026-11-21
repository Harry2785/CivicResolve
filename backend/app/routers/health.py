from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query
from app.core.config import settings
from app.database import check_db_health

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
def get_health(test_gemini: bool = Query(False, description="Whether to perform a live test ping to Gemini API")):
    """
    Health check endpoint to verify backend API, database connectivity,
    and Gemini AI operational status.
    """
    db_ok = check_db_health()
    gemini_ready = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here")

    response_data = {
        "status": "healthy" if db_ok else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "runtime": "Vercel Serverless" if settings.IS_VERCEL else "ASGI Server",
        "database": "connected" if db_ok else "disconnected",
        "database_type": settings.database_type,
        "gemini_configured": gemini_ready,
        "gemini_model": settings.GEMINI_MODEL,
        "fallback_model": settings.FALLBACK_GEMINI_MODEL,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    if test_gemini and gemini_ready:
        try:
            from app.services.ai_service import _get_gemini_client
            client = _get_gemini_client()
            if client:
                res = client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents="Ping. Respond with 'Pong'."
                )
                response_data["gemini_responding"] = bool(res and res.text)
                response_data["gemini_test_status"] = "Responding (Verified Live)"
            else:
                response_data["gemini_responding"] = False
                response_data["gemini_test_status"] = "Client initialization failed"
        except Exception as e:
            response_data["gemini_responding"] = False
            response_data["gemini_test_status"] = f"Test request failed: {str(e)}"

    return response_data
