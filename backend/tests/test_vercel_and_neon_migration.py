import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import Settings
from app.database import check_db_health, init_db, migrate_db_schema
from app.services.image_service import validate_and_save_image

client = TestClient(app)


def test_database_url_normalization():
    """Verify postgres:// is automatically normalized to postgresql:// for SQLAlchemy/Neon compatibility."""
    s = Settings()
    original_db = os.environ.get("DATABASE_URL")
    try:
        # Test 1: postgres:// conversion
        os.environ["DATABASE_URL"] = "postgres://user:secret@ep-cool-fog-1234.us-east-2.aws.neon.tech/neondb?sslmode=require"
        assert s.DATABASE_URL.startswith("postgresql+psycopg2://")
        assert s.is_postgres is True
        assert s.database_type == "PostgreSQL (Neon)"

        # Test 2: postgresql:// preserved
        os.environ["DATABASE_URL"] = "postgresql://user:secret@ep-cool-fog-1234.us-east-2.aws.neon.tech/neondb?sslmode=require"
        assert s.DATABASE_URL.startswith("postgresql+psycopg2://")
        assert s.is_postgres is True

        # Test 3: empty defaults to SQLite
        os.environ.pop("DATABASE_URL", None)
        assert s.DATABASE_URL.startswith("sqlite:///")
        assert s.is_postgres is False
        assert s.database_type == "SQLite"
    finally:
        if original_db:
            os.environ["DATABASE_URL"] = original_db
        else:
            os.environ.pop("DATABASE_URL", None)


def test_vercel_serverless_entrypoint():
    """Verify api/index.py exports ASGI app cleanly for Vercel Python runtime."""
    import sys
    from pathlib import Path
    root_dir = Path(__file__).resolve().parent.parent.parent
    if str(root_dir) not in sys.path:
        sys.path.insert(0, str(root_dir))

    import api.index as vercel_entry
    assert hasattr(vercel_entry, "app")
    assert vercel_entry.app is not None


def test_health_endpoint_diagnostics():
    """Verify /api/health returns real database type and operational status."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "database" in data
    assert "database_type" in data
    assert "gemini_configured" in data
    assert "runtime" in data
    assert data["database"] == "connected"


def test_serverless_idempotent_init_db():
    """Verify that repeatedly calling init_db() does not drop tables or crash."""
    init_db()
    init_db()
    assert check_db_health() is True


def test_data_url_image_storage_fallback(tmp_path):
    """Verify that when running on Vercel without external blob storage, image returns persistent data URL."""
    from fastapi import UploadFile
    import io
    from PIL import Image

    # Create dummy 50x50 PNG
    img_byte_arr = io.BytesIO()
    img = Image.new('RGB', (50, 50), color='blue')
    img.save(img_byte_arr, format='PNG')
    raw_bytes = img_byte_arr.getvalue()

    upload_file = UploadFile(filename="test_pothole.png", file=io.BytesIO(raw_bytes))

    # Simulate Vercel runtime flag
    os.environ["USE_DATA_URL_STORAGE"] = "1"
    try:
        url, mime, b = validate_and_save_image(upload_file, raw_bytes, tmp_path)
        assert mime == "image/png"
        assert url.startswith("data:image/png;base64,")
    finally:
        os.environ.pop("USE_DATA_URL_STORAGE", None)
