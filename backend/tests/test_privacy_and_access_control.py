import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, init_db
from app.models.issue import Issue

client = TestClient(app)

# Test identity headers using our server-side token parser
CITIZEN_A_HEADERS = {"Authorization": "Bearer test-citizen:citizen_a@example.com"}
CITIZEN_B_HEADERS = {"Authorization": "Bearer test-citizen:citizen_b@example.com"}
ADMIN_HEADERS = {"Authorization": "Bearer test-admin:official1@example.gov.in"}


@pytest.fixture(autouse=True)
def setup_db():
    """Ensure tables exist before tests."""
    init_db()


def test_unauthenticated_cannot_submit_complaints():
    """1 & 6. Unauthenticated visitors are rejected with HTTP 401 when creating complaints."""
    payload = {
        "title": "Unauthenticated crater complaint",
        "description": "Attempting submission without bearer token.",
        "location": "Main Square 1",
        "citizen_category": "Roads & Potholes"
    }

    # JSON endpoint
    res_json = client.post("/api/issues", json=payload)
    assert res_json.status_code == 401, f"Expected 401, got {res_json.status_code}"
    assert "Authentication required" in res_json.json()["detail"]

    # Upload endpoint
    form_data = {
        "title": "Unauthenticated upload attempt",
        "description": "Attempting upload without bearer token.",
        "location": "Main Square 1",
        "citizen_category": "Roads & Potholes"
    }
    res_upload = client.post("/api/issues/upload", data=form_data)
    assert res_upload.status_code == 401, f"Expected 401, got {res_upload.status_code}"


def test_unauthenticated_cannot_access_private_complaint_endpoints():
    """1. Unauthenticated visitors cannot access personal or individual complaint details."""
    # Detail endpoint
    res_detail = client.get("/api/issues/1")
    assert res_detail.status_code == 401

    res_track = client.get("/api/issues/CR-20261121-TEST01")
    assert res_track.status_code == 401

    # Personal issues endpoint
    res_my = client.get("/api/issues/my")
    assert res_my.status_code == 401


def test_citizen_complaint_ownership_and_isolation():
    """2, 3 & 4. Citizen A owns their complaint. Citizen B cannot access it by ID or tracking ID."""
    # Citizen A submits a complaint
    p_a = {
        "title": "Citizen A private grievance regarding broken waterline",
        "description": "Water leaking right in front of Citizen A private gate.",
        "location": "Residential Lane 4",
        "citizen_category": "Water & Drainage"
    }
    res_create = client.post("/api/issues", json=p_a, headers=CITIZEN_A_HEADERS)
    assert res_create.status_code == 201
    created_a = res_create.json()
    tracking_id_a = created_a["tracking_id"]
    issue_id_a = created_a["id"]
    assert created_a["citizen_uid"] == "mock_citizen_citizen_a@example.com"

    # 3. Citizen A CAN access their own complaint by tracking ID
    res_a_track = client.get(f"/api/issues/{tracking_id_a}", headers=CITIZEN_A_HEADERS)
    assert res_a_track.status_code == 200
    assert res_a_track.json()["tracking_id"] == tracking_id_a
    assert res_a_track.json()["title"] == p_a["title"]

    # 3. Citizen A CAN access their own complaint by integer ID
    res_a_id = client.get(f"/api/issues/{issue_id_a}", headers=CITIZEN_A_HEADERS)
    assert res_a_id.status_code == 200

    # 3. Citizen A sees their complaint in /api/issues/my
    res_a_my = client.get("/api/issues/my", headers=CITIZEN_A_HEADERS)
    assert res_a_my.status_code == 200
    my_ids = [item["tracking_id"] for item in res_a_my.json()["issues"]]
    assert tracking_id_a in my_ids

    # 2. Citizen B CANNOT access Citizen A's complaint by tracking ID (returns 404 to avoid revealing existence)
    res_b_track = client.get(f"/api/issues/{tracking_id_a}", headers=CITIZEN_B_HEADERS)
    assert res_b_track.status_code == 404, f"Expected 404, got {res_b_track.status_code}"

    # 2. Citizen B CANNOT access Citizen A's complaint by integer ID (returns 404)
    res_b_id = client.get(f"/api/issues/{issue_id_a}", headers=CITIZEN_B_HEADERS)
    assert res_b_id.status_code == 404, f"Expected 404, got {res_b_id.status_code}"

    # 4. Altered / guessed tracking IDs return 404 for Citizen B
    altered_id = tracking_id_a[:-2] + "99"
    res_b_altered = client.get(f"/api/issues/{altered_id}", headers=CITIZEN_B_HEADERS)
    assert res_b_altered.status_code == 404

    # 2. Citizen B does NOT see Citizen A's complaint in their personal complaints
    res_b_my = client.get("/api/issues/my", headers=CITIZEN_B_HEADERS)
    assert res_b_my.status_code == 200
    b_ids = [item["tracking_id"] for item in res_b_my.json()["issues"]]
    assert tracking_id_a not in b_ids

    # 8. Approved Admin CAN view Citizen A's complaint for municipal resolution
    res_admin_track = client.get(f"/api/issues/{tracking_id_a}", headers=ADMIN_HEADERS)
    assert res_admin_track.status_code == 200
    assert res_admin_track.json()["tracking_id"] == tracking_id_a


def test_public_feed_data_minimization_and_sanitization():
    """5. Public community feed never exposes tracking IDs, images, admin notes, or citizen UIDs."""
    # Ensure there is at least one complaint
    client.post("/api/issues", json={
        "title": "Public streetlight issue on 2nd avenue",
        "description": "Streetlight pole flickering intermittently at night.",
        "location": "2nd Avenue Cross 3",
        "citizen_category": "Streetlights & Electrical"
    }, headers=CITIZEN_A_HEADERS)

    # 1. Test dedicated /api/issues/feed endpoint (no auth required)
    res_feed = client.get("/api/issues/feed")
    assert res_feed.status_code == 200
    feed_data = res_feed.json()
    assert "total" in feed_data
    assert "issues" in feed_data
    assert len(feed_data["issues"]) > 0

    for item in feed_data["issues"]:
        # Permitted fields
        assert "category" in item
        assert "description" in item
        assert "location" in item
        assert "status" in item
        assert "created_at" in item

        # FORBIDDEN private fields must NOT exist in public item
        assert "tracking_id" not in item, "Privacy violation: tracking_id exposed in public feed!"
        assert "citizen_uid" not in item, "Privacy violation: citizen_uid exposed in public feed!"
        assert "image_path" not in item, "Privacy violation: image_path exposed in public feed!"
        assert "admin_notes" not in item, "Privacy violation: admin_notes exposed in public feed!"
        assert "urgency_reasoning" not in item, "Privacy violation: urgency_reasoning exposed in public feed!"
        assert "id" not in item, "Privacy violation: database id exposed in public feed!"

    # 2. Test unauthenticated /api/issues endpoint returns sanitized response
    res_unauth_issues = client.get("/api/issues")
    assert res_unauth_issues.status_code == 200
    unauth_data = res_unauth_issues.json()
    for item in unauth_data["issues"]:
        assert "tracking_id" not in item
        assert "citizen_uid" not in item
        assert "image_path" not in item


def test_citizens_cannot_access_admin_endpoints():
    """7. Citizens cannot access admin endpoints (HTTP 403 Forbidden)."""
    # Verify endpoint
    res_verify = client.get("/api/admin/verify", headers=CITIZEN_A_HEADERS)
    assert res_verify.status_code == 403

    # Admin issues endpoint
    res_admin_issues = client.get("/api/admin/issues", headers=CITIZEN_A_HEADERS)
    assert res_admin_issues.status_code == 403

    # Admin stats endpoint
    res_admin_stats = client.get("/api/admin/stats", headers=CITIZEN_A_HEADERS)
    assert res_admin_stats.status_code == 403

    # Department analytics
    res_dept = client.get("/api/analytics/departments", headers=CITIZEN_A_HEADERS)
    assert res_dept.status_code == 403

    # Hotspot intelligence
    res_hotspots = client.get("/api/analytics/hotspots", headers=CITIZEN_A_HEADERS)
    assert res_hotspots.status_code == 403


def test_approved_admins_can_access_authorized_endpoints():
    """8. Approved administrators on allowlist can access all admin endpoints."""
    # Verify endpoint
    res_verify = client.get("/api/admin/verify", headers=ADMIN_HEADERS)
    assert res_verify.status_code == 200
    assert res_verify.json()["role"] == "admin"

    # Admin issues list
    res_admin_issues = client.get("/api/admin/issues", headers=ADMIN_HEADERS)
    assert res_admin_issues.status_code == 200

    # Admin stats
    res_admin_stats = client.get("/api/admin/stats", headers=ADMIN_HEADERS)
    assert res_admin_stats.status_code == 200

    # Department analytics
    res_dept = client.get("/api/analytics/departments", headers=ADMIN_HEADERS)
    assert res_dept.status_code == 200

    # Hotspots
    res_hotspots = client.get("/api/analytics/hotspots", headers=ADMIN_HEADERS)
    assert res_hotspots.status_code == 200


def test_direct_api_cannot_bypass_security():
    """9. Forged, invalid, or malformed headers cannot bypass authentication."""
    forged_headers = [
        {"Authorization": "Bearer invalid.jwt.token"},
        {"Authorization": "Basic dXNlcjpwYXNz"},
        {"Authorization": ""},
        {"Authorization": "Bearer test-citizen:hacker@evil.com"}
    ]

    # Forged token on admin endpoint must fail
    for h in forged_headers[:3]:
        assert client.get("/api/admin/verify", headers=h).status_code in [401, 403]

    # Citizen trying to act as admin must be rejected
    res_escalation = client.get("/api/admin/verify", headers={"Authorization": "Bearer test-citizen:hacker@evil.com"})
    assert res_escalation.status_code == 403
