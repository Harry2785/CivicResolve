import pytest
from fastapi import HTTPException

from app.core import auth


def test_mock_auth_is_rejected_when_disabled(monkeypatch):
    monkeypatch.setattr(auth.settings, "ALLOW_TEST_AUTH", False)

    with pytest.raises(HTTPException) as exc:
        auth.decode_and_verify_token("test-admin:official1@example.gov.in")

    assert exc.value.status_code == 401


def test_untrusted_token_audience_is_rejected(monkeypatch):
    monkeypatch.setattr(auth.settings, "ALLOW_TEST_AUTH", False)
    monkeypatch.setattr(
        auth,
        "get_unverified_payload",
        lambda _token: {"aud": "attacker-project", "iss": "https://securetoken.google.com/attacker-project"},
    )

    with pytest.raises(HTTPException) as exc:
        auth.decode_and_verify_token("header.payload.signature")

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid authentication token audience."


def test_admin_requires_verified_allowlisted_email(monkeypatch):
    monkeypatch.setattr(auth.settings, "ADMIN_EMAILS_RAW", "admin@example.com")

    with pytest.raises(HTTPException) as exc:
        auth.authorize_admin_claims(
            {"uid": "unverified", "email": "admin@example.com", "email_verified": False}
        )
    assert exc.value.status_code == 403

    authorized = auth.authorize_admin_claims(
        {"uid": "verified", "email": " ADMIN@example.com ", "email_verified": True}
    )
    assert authorized["email"] == "admin@example.com"


def test_live_gemini_health_check_requires_admin():
    from fastapi.testclient import TestClient
    from app.main import app

    response = TestClient(app).get("/api/health?test_gemini=true")
    assert response.status_code in (401, 403)


def test_production_rejects_mock_auth_even_if_enabled(monkeypatch):
    monkeypatch.setattr(auth.settings, "ALLOW_TEST_AUTH", True)
    monkeypatch.setattr(auth.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(auth.settings, "FIREBASE_PROJECT_ID", "civicresolve-test")
    with pytest.raises(HTTPException) as exc:
        auth.decode_and_verify_token("test-admin:official1@example.gov.in")
    assert exc.value.status_code == 401


def test_firebase_fallback_uses_configured_project_and_normalizes_uid(monkeypatch):
    monkeypatch.setattr(auth.settings, "ALLOW_TEST_AUTH", False)
    monkeypatch.setattr(auth.settings, "FIREBASE_PROJECT_ID", "civicresolve-test")
    monkeypatch.setattr(auth, "get_unverified_payload", lambda token: {
        "aud": "civicresolve-test",
        "iss": "https://securetoken.google.com/civicresolve-test",
    })
    monkeypatch.setattr(auth, "ensure_firebase_admin_initialized", lambda: None)
    monkeypatch.setattr(auth.settings, "FIREBASE_CREDENTIALS_PATH", "")

    def fail_admin(*args, **kwargs):
        raise ValueError("No Admin SDK credentials")

    def verify(token, request, audience):
        assert audience == "civicresolve-test"
        return {"sub": "verified-firebase-uid", "email_verified": True}

    monkeypatch.setattr(auth.firebase_auth, "verify_id_token", fail_admin)
    monkeypatch.setattr(auth.google_id_token, "verify_firebase_token", verify)
    claims = auth.decode_and_verify_token("signed-token")
    assert claims["uid"] == "verified-firebase-uid"


def test_unverified_allowlisted_email_cannot_read_all_issues(monkeypatch):
    monkeypatch.setattr(auth.settings, "ADMIN_EMAILS_RAW", "admin@example.com")
    assert auth.is_authorized_admin({
        "email": "admin@example.com", "email_verified": False,
    }) is False


def test_unsigned_payload_never_accepted_after_verification_fails(monkeypatch):
    monkeypatch.setattr(auth.settings, "ALLOW_TEST_AUTH", True)
    monkeypatch.setattr(auth.settings, "FIREBASE_PROJECT_ID", "civicresolve-test")
    monkeypatch.setattr(auth, "get_unverified_payload", lambda token: {
        "aud": "civicresolve-test",
        "iss": "https://securetoken.google.com/civicresolve-test",
        "email": "official1@example.gov.in",
    })
    monkeypatch.setattr(auth, "ensure_firebase_admin_initialized", lambda: None)

    def reject(*args, **kwargs):
        raise ValueError("Bad signature")

    monkeypatch.setattr(auth.firebase_auth, "verify_id_token", reject)
    monkeypatch.setattr(auth.google_id_token, "verify_firebase_token", reject)
    with pytest.raises(HTTPException) as exc:
        auth.decode_and_verify_token("forged-token")
    assert exc.value.status_code == 401


def test_health_hides_provider_exception(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.routers import health
    from app.services import ai_service

    monkeypatch.setattr(health.settings, "GEMINI_API_KEY", "test-only-key")

    def fail_client():
        raise ValueError("sensitive-provider-detail")

    monkeypatch.setattr(ai_service, "_get_gemini_client", fail_client)
    response = TestClient(app).get(
        "/api/health?test_gemini=true",
        headers={"Authorization": "Bearer test-admin:official1@example.gov.in"},
    )
    assert response.status_code == 200
    assert response.json()["gemini_responding"] is False
    assert "sensitive-provider-detail" not in response.text
