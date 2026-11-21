from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_api_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert "timestamp" in data
    assert "version" in data
    assert "gemini_model" in data
    assert "fallback_model" in data


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "CivicResolve" in data["message"]
    assert "issues_endpoint" in data
