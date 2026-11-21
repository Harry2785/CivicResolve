import base64
import io

import pytest
from fastapi import UploadFile
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.database import Base
from app.models.issue import Issue, generate_tracking_id
from app.services.image_service import validate_and_save_image


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg", "postgresql+psycopg2"])
def test_postgres_urls_select_installed_driver(monkeypatch, scheme):
    monkeypatch.setenv("DATABASE_URL", f"{scheme}://user:password@localhost/database?sslmode=require")
    url = Settings().DATABASE_URL
    assert url.startswith("postgresql+psycopg2://")
    assert url.endswith("?sslmode=require")
    engine = create_engine(url)
    assert engine.dialect.driver == "psycopg2"
    engine.dispose()


def test_production_requires_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _ = settings.DATABASE_URL


def test_production_requires_explicit_firebase_project(monkeypatch):
    settings = Settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "")
    with pytest.raises(RuntimeError, match="FIREBASE_PROJECT_ID"):
        _ = settings.firebase_project_id


def test_render_image_survives_new_database_connection(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_DATA_URL_STORAGE", "1")
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "")
    image = io.BytesIO()
    Image.new("RGB", (12, 12), "blue").save(image, format="PNG")
    content = image.getvalue()
    url, mime, validated = validate_and_save_image(
        UploadFile(filename="evidence.png", file=io.BytesIO(content)),
        content, tmp_path / "ephemeral-uploads",
    )
    assert url.startswith("data:image/png;base64,")
    assert validated == content
    db_url = f"sqlite:///{tmp_path / 'persistence.db'}"
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as session:
        session.add(Issue(
            tracking_id=generate_tracking_id(), title="Upload persistence test",
            description="Evidence must survive the upload filesystem disappearing.",
            location="Test location", citizen_category="Other", image_path=url,
        ))
        session.commit()
    engine.dispose()
    # Simulate a lost Render ephemeral upload directory and a fresh process/connection.
    for path in (tmp_path / "ephemeral-uploads").iterdir():
        path.unlink()
    fresh_engine = create_engine(db_url)
    with sessionmaker(bind=fresh_engine)() as session:
        stored = session.query(Issue).one()
        assert base64.b64decode(stored.image_path.split(",", 1)[1]) == content
    fresh_engine.dispose()


def test_cors_rejects_unrelated_vercel_origin():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    denied = client.options("/api/issues", headers={
        "Origin": "https://untrusted-project.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
    allowed = client.options("/api/issues", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_disconnected_database_fails_render_health_check(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.routers import health

    monkeypatch.setattr(health, "check_db_health", lambda: False)
    response = TestClient(app).get("/api/health")
    assert response.status_code == 503
    assert response.json()["database"] == "disconnected"
