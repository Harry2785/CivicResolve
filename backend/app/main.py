import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.database import init_db, get_db
from app.routers import health, issues, admin, analytics
from app.core.auth import require_admin
# Import models to ensure they are registered with SQLAlchemy Base
from app.models import Issue

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("civicresolve")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure SQLite database tables are created safely
    try:
        init_db()
    except Exception as e:
        logger.warning(f"Database initialization deferred: {e}")
    yield
    # Shutdown logic if needed


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    lifespan=lifespan
)

# Configure CORS for frontend communication (supports Vercel, local Vite, and custom origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f}ms)")
    return response

# Serve uploaded evidence images statically (guarantee directory exists safely)
if not settings.UPLOAD_DIR.exists() and not str(settings.UPLOAD_DIR).startswith("/var/task"):
    try:
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

if settings.UPLOAD_DIR.exists():
    app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")
    app.mount(f"{settings.API_PREFIX}/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="api_uploads")

# Register API routers with /api prefix
app.include_router(health.router, prefix=settings.API_PREFIX)
app.include_router(issues.router, prefix=settings.API_PREFIX)
app.include_router(admin.router, prefix=settings.API_PREFIX)
app.include_router(analytics.router, prefix=settings.API_PREFIX)

# Also mount without /api prefix for environments where proxy rewrites strip the prefix
app.include_router(health.router)
app.include_router(issues.router)
app.include_router(admin.router)
app.include_router(analytics.router)

# Direct /api/stats route alias for admin dashboards
@app.get(f"{settings.API_PREFIX}/stats", tags=["Statistics"])
@app.get("/stats", tags=["Statistics"])
def get_stats_direct(
    db = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Return dashboard statistics based on actual database records.
    Restricted: Requires verified municipal administrator credentials.
    """
    from app.routers.issues import _calculate_stats_summary
    return _calculate_stats_summary(db=db)


@app.get("/api/index.py", tags=["Root"])
@app.get("/index.py", tags=["Root"])
@app.get(f"{settings.API_PREFIX}", tags=["Root"])
@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to CivicResolve API",
        "version": settings.VERSION,
        "runtime": "Vercel Serverless" if settings.IS_VERCEL else "ASGI Server",
        "database": settings.database_type,
        "docs_url": "/docs",
        "health_check": f"{settings.API_PREFIX}/health",
        "issues_endpoint": f"{settings.API_PREFIX}/issues"
    }
