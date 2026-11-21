from datetime import datetime, timezone
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from app.core.config import settings
from app.core.auth import authorize_admin_claims, optional_authenticated_user
from app.database import check_db_health

router = APIRouter(prefix="/health", tags=["Health"])
logger = logging.getLogger("civicresolve.health")


@router.get("")
def get_health(
    response: Response,
    test_gemini: bool = Query(False, description="Whether to perform an administrator-authorized live Gemini test"),
    current_user: Optional[dict] = Depends(optional_authenticated_user),
):
    """
    Health check endpoint to verify backend API, database connectivity,
    and Gemini AI operational status.
    """
    if test_gemini:
        authorize_admin_claims(current_user or {})

    db_ok = check_db_health()
    if not db_ok:
        response.status_code = 503
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
            logger.warning("Gemini health check failed: %s", e)
            response_data["gemini_responding"] = False
            response_data["gemini_test_status"] = "Live check failed"

    return response_data
