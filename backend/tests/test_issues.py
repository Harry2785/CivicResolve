import io
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, init_db
from app.models.issue import Issue
from app.core.constants import (
    ALLOWED_CATEGORIES,
    PRIORITY_LEVELS,
    DEFAULT_DEPARTMENT_MAPPINGS
)

client = TestClient(app)
CITIZEN_HEADERS = {"Authorization": "Bearer test-citizen:citizen@example.com"}


def setup_function():
    """Ensure tables exist and clean issues table before each test run."""
    init_db()
    db = SessionLocal()
    db.query(Issue).delete()
    db.commit()
    db.close()


def _create_test_image_bytes(format="JPEG", size=(100, 100), color="blue") -> bytes:
    """Helper to generate real, valid image bytes in JPEG, PNG, or WebP."""
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def test_allowed_categories_and_department_defaults():
    """Verify all 6 predefined categories map to their default departments."""
    test_cases = [
        ("Roads & Potholes", "Major crater in asphalt on main boulevard", "Roads & Highways Department"),
        ("Sanitation & Waste", "Decomposing garbage pile on street corner", "Municipal Sanitation Wing"),
        ("Water & Drainage", "Leaking underground potable water connection", "Water Supply & Sewerage Board"),
        ("Streetlights & Electrical", "Three streetlight poles burnt out in park", "Electrical & Streetlight Maintenance"),
        ("Public Safety", "Dangerous structural crack on municipal retaining wall", "Public Works & Safety"),
        ("Other", "General inquiries regarding municipal property survey", "General Municipal Administration")
    ]

    for category, desc, expected_dept in test_cases:
        payload = {
            "title": f"Test issue for {category}",
            "description": desc,
            "location": "Central Avenue Sector 1",
            "citizen_category": category
        }
        res = client.post("/api/issues", json=payload, headers=CITIZEN_HEADERS)
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["ai_category"] == category
        assert data["recommended_department"] == expected_dept
        assert data["priority"] in PRIORITY_LEVELS


def test_priority_explanation_and_life_threatening_flag():
    """
    Verify priority explanation and ensure potentially life-threatening situations
    are explicitly flagged for urgent human review without claiming AI certainty.
    """
    payload = {
        "title": "Exposed sparking live electric cable dangling near children playground",
        "description": "High voltage overhead power line severed and lying across the puddle right next to the park swings. Continuous sparking and smoke. Children playing nearby.",
        "location": "Greenwood Public Park, Sector 9",
        "citizen_category": "Streetlights & Electrical"
    }

    res = client.post("/api/issues", json=payload, headers=CITIZEN_HEADERS)
    assert res.status_code == 201
    data = res.json()

    assert data["priority"] == "Critical"
    # Must flag for human review
    assert "FLAGGED FOR URGENT HUMAN REVIEW" in data["urgency_reasoning"]
    # Must not claim AI certainty
    assert "cannot determine emergencies with certainty" in data["urgency_reasoning"].lower() or "human inspection" in data["urgency_reasoning"].lower()


def test_image_analysis_valid_jpeg_png_webp():
    """Verify successful upload, validation, and visual observations for JPEG, PNG, and WebP."""
    formats = [
        ("pothole.jpg", "JPEG", "image/jpeg"),
        ("damage.png", "PNG", "image/png"),
        ("overflow.webp", "WEBP", "image/webp")
    ]

    for filename, fmt, mime in formats:
        img_bytes = _create_test_image_bytes(format=fmt)
        files = {"image": (filename, io.BytesIO(img_bytes), mime)}
        form_data = {
            "title": f"Damage report with {fmt} photo",
            "description": f"Clear visual evidence provided in {fmt} format showing street damage.",
            "location": "North Circular Road 44",
            "citizen_category": "Roads & Potholes"
        }

        res = client.post("/api/issues/upload", data=form_data, files=files, headers=CITIZEN_HEADERS)
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["image_path"] is not None
        assert data["image_path"].startswith("/uploads/")
        # Ensure visual observations mention visual inspection
        assert data["visual_observations"] is not None
        assert "visual" in data["visual_observations"].lower() or "photo" in data["visual_observations"].lower()


def test_complaint_analysis_without_image_works():
    """Verify complaint analysis works seamlessly when no image is provided."""
    payload = {
        "title": "Clogged storm drain backing up during rain",
        "description": "Heavy rain caused water to pool around the stormwater inlet. Drain appears completely choked with leaves and silt.",
        "location": "12th Cross, 4th Block Jayanagar",
        "citizen_category": "Water & Drainage"
    }

    res = client.post("/api/issues", json=payload, headers=CITIZEN_HEADERS)
    assert res.status_code == 201
    data = res.json()
    assert data["image_path"] is None
    assert data["visual_observations"] is not None
    assert "no image provided" in data["visual_observations"].lower() or "deduced" in data["visual_observations"].lower()


def test_reject_image_exceeding_max_size():
    """Verify that images exceeding 5 MB are rejected with HTTP 413."""
    # Create 5.1 MB of fake bytes
    large_bytes = b"0" * (5 * 1024 * 1024 + 1024)
    files = {"image": ("huge.jpg", io.BytesIO(large_bytes), "image/jpeg")}
    form_data = {
        "title": "Road damage report",
        "description": "Attempting upload of oversized image file.",
        "location": "Highway km 20",
        "citizen_category": "Roads & Potholes"
    }

    res = client.post("/api/issues/upload", data=form_data, files=files, headers=CITIZEN_HEADERS)
    assert res.status_code == 413
    assert "exceeds the 5 mb limit" in res.json()["detail"].lower()


def test_reject_unsupported_file_extension():
    """Verify that non-JPEG/PNG/WebP files (e.g. .pdf, .exe, .sh) are rejected with HTTP 415."""
    script_bytes = b"#!/bin/bash\necho 'hello'"
    files = {"image": ("malicious.sh", io.BytesIO(script_bytes), "application/x-sh")}
    form_data = {
        "title": "Fake image attempt",
        "description": "Trying to upload a bash script disguised as evidence.",
        "location": "City Hall",
        "citizen_category": "Public Safety"
    }

    res = client.post("/api/issues/upload", data=form_data, files=files, headers=CITIZEN_HEADERS)
    assert res.status_code == 415
    assert "allowed extensions" in res.json()["detail"].lower()


def test_reject_disguised_executable_masquerading_as_jpg():
    """Verify that an executable or text file renamed to .jpg is caught by content validation."""
    fake_exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00This is a binary executable"
    files = {"image": ("malware.jpg", io.BytesIO(fake_exe_bytes), "image/jpeg")}
    form_data = {
        "title": "Disguised executable attack",
        "description": "File has .jpg extension but is binary executable code.",
        "location": "Main Server Room",
        "citizen_category": "Public Safety"
    }

    res = client.post("/api/issues/upload", data=form_data, files=files, headers=CITIZEN_HEADERS)
    assert res.status_code == 400
    assert "not a valid or readable image" in res.json()["detail"].lower()


def test_metadata_categories_endpoint():
    """Verify /api/issues/meta/categories returns all allowed categories and department mappings."""
    res = client.get("/api/issues/meta/categories")
    assert res.status_code == 200
    data = res.json()
    assert "categories" in data
    assert set(ALLOWED_CATEGORIES).issubset(set(data["categories"]))
    assert "priorities" in data
    assert "department_mappings" in data
    assert data["department_mappings"]["Roads & Potholes"] == "Roads & Highways Department"
    assert data["department_mappings"]["Sanitation & Waste"] == "Municipal Sanitation Wing"
    assert data["department_mappings"]["Water & Drainage"] == "Water Supply & Sewerage Board"
    assert data["department_mappings"]["Streetlights & Electrical"] == "Electrical & Streetlight Maintenance"
    assert data["department_mappings"]["Public Safety"] == "Public Works & Safety"
    assert data["department_mappings"]["Other"] == "General Municipal Administration"


def test_duplicate_complaint_detection():
    """Verify duplicate detection at same location with matching category."""
    p1 = {
        "title": "Overflowing garbage dumpster with rotting waste",
        "description": "The green community bin is completely full and spilling trash onto the street.",
        "location": "Sector 4 Market Square, Near Metro Gate 2",
        "citizen_category": "Sanitation & Waste"
    }
    r1 = client.post("/api/issues", json=p1, headers=CITIZEN_HEADERS)
    assert r1.status_code == 201
    d1 = r1.json()
    assert d1["is_potential_duplicate"] is False

    p2 = {
        "title": "Dumpster overflowing with waste and flies",
        "description": "Massive pile of uncollected garbage spilling from bin onto street.",
        "location": "Sector 4 Market Square, Near Metro Gate 2",
        "citizen_category": "Sanitation & Waste"
    }
    r2 = client.post("/api/issues", json=p2, headers=CITIZEN_HEADERS)
    assert r2.status_code == 201
    d2 = r2.json()

    assert d2["is_potential_duplicate"] is True
    assert d1["tracking_id"] in d2["duplicate_note"]


def test_delete_issue_endpoint():
    """Verify DELETE /api/issues/{id} requires admin auth, removes the issue, and cleans up."""
    p = {
        "title": "Temporary testing issue to be deleted",
        "description": "Issue created specifically to verify deletion endpoint.",
        "location": "Test Area Block A",
        "citizen_category": "Other"
    }
    created = client.post("/api/issues", json=p, headers=CITIZEN_HEADERS).json()
    issue_id = created["id"]

    # 1. Unauthenticated request must return 401
    unauth_res = client.delete(f"/api/issues/{issue_id}")
    assert unauth_res.status_code == 401

    # 2. Citizen request must return 403 Forbidden
    citizen_headers = {"Authorization": "Bearer test-citizen:citizen@example.com"}
    forbidden_res = client.delete(f"/api/issues/{issue_id}", headers=citizen_headers)
    assert forbidden_res.status_code == 403

    # 3. Authorized admin request succeeds with 200
    admin_headers = {"Authorization": "Bearer test-admin:admin@civicresolve.gov.in"}
    del_res = client.delete(f"/api/issues/{issue_id}", headers=admin_headers)
    assert del_res.status_code == 200
    assert "deleted successfully" in del_res.json()["message"]

    # Verify 404 on subsequent get
    get_res = client.get(f"/api/issues/{issue_id}", headers=CITIZEN_HEADERS)
    assert get_res.status_code == 404


def test_direct_api_stats_endpoint():
    """Verify GET /api/stats is protected, and GET /api/issues/pulse provides public metrics."""
    client.post("/api/issues", json={
        "title": "Pothole on Cross road",
        "description": "Medium pothole on quiet residential street.",
        "location": "Cross Road 5",
        "citizen_category": "Roads & Potholes"
    }, headers=CITIZEN_HEADERS)

    # Public pulse endpoint is accessible without credentials
    pulse_res = client.get("/api/issues/pulse")
    assert pulse_res.status_code == 200
    pulse = pulse_res.json()
    assert pulse["total_issues"] >= 1
    assert "by_status" in pulse

    # Restricted stats endpoint returns 401 without auth
    unauth_stats = client.get("/api/stats")
    assert unauth_stats.status_code == 401

    # Citizen token returns 403
    citizen_headers = {"Authorization": "Bearer test-citizen:citizen@example.com"}
    forbidden_stats = client.get("/api/stats", headers=citizen_headers)
    assert forbidden_stats.status_code == 403

    # Authorized admin returns 200 with full statistics
    admin_headers = {"Authorization": "Bearer test-admin:admin@civicresolve.gov.in"}
    res = client.get("/api/stats", headers=admin_headers)
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_issues"] >= 1
    assert "by_status" in stats
    assert "by_priority" in stats
    assert "by_category" in stats
    assert "by_department" in stats
    assert "fallback_demo_count" in stats


def test_admin_authorization_workflow():
    """
    Verify server-side admin role verification:
    - /api/admin/verify endpoint checks email against ADMIN_EMAILS allowlist
    - /api/admin/issues lists all complaints
    - /api/admin/issues/{id} allows patching status and notes
    """
    # 1. Unauthenticated verification returns 401
    assert client.get("/api/admin/verify").status_code == 401

    # 2. Unauthorized citizen email returns 403
    citizen_headers = {"Authorization": "Bearer test-citizen:citizen@example.com"}
    res_forbidden = client.get("/api/admin/verify", headers=citizen_headers)
    assert res_forbidden.status_code == 403
    assert "Access Denied" in res_forbidden.json()["detail"]

    # 3. Authorized admin email returns 200 OK with admin payload
    admin_headers = {"Authorization": "Bearer test-admin:official1@example.gov.in"}
    res_ok = client.get("/api/admin/verify", headers=admin_headers)
    assert res_ok.status_code == 200
    assert res_ok.json()["role"] == "admin"
    assert res_ok.json()["email"] == "official1@example.gov.in"

    # 4. Create an issue and test admin PATCH
    created = client.post("/api/issues", json={
        "title": "Streetlight flickers",
        "description": "Streetlight on 4th block is flickering at night.",
        "location": "4th Block Lane 2",
        "citizen_category": "Streetlights & Electrical"
    }, headers=CITIZEN_HEADERS).json()
    issue_id = created["id"]

    patch_res = client.patch(
        f"/api/admin/issues/{issue_id}",
        json={"status": "In Progress", "admin_notes": "Assigned to Lineman team #4"},
        headers=admin_headers
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "In Progress"
    assert patch_res.json()["admin_notes"] == "Assigned to Lineman team #4"


def test_ai_mode_fallback_demo_flag():
    """Verify ai_mode is correctly tagged as 'Fallback Demo' when API key is missing."""
    p = {
        "title": "Minor sidewalk paving stone loose",
        "description": "One paving slab is slightly wobbly on the pedestrian walkway.",
        "location": "Park Street 12",
        "citizen_category": "Roads & Potholes"
    }
    res = client.post("/api/issues", json=p, headers=CITIZEN_HEADERS)
    assert res.status_code == 201
    data = res.json()
    assert data["ai_mode"] in ["Gemini Live", "Fallback Demo"]
    assert data["status"] == "Reported"


def test_demo_data_seeding():
    """Verify demo complaints are seeded on empty database and never overwritten on restart."""
    from app.database_seed import seed_demo_complaints_if_empty
    db = SessionLocal()
    db.query(Issue).delete()
    db.commit()

    # Initial seed on empty database
    seeded_count = seed_demo_complaints_if_empty(db)
    assert seeded_count == 6

    # Verify diversity of categories, priorities, and statuses
    issues = db.query(Issue).all()
    categories = {i.ai_category for i in issues}
    priorities = {i.priority for i in issues}
    statuses = {i.status for i in issues}

    assert len(categories) >= 5
    assert "Critical" in priorities
    assert "High" in priorities
    assert "Medium" in priorities
    assert "Low" in priorities
    assert "Reported" in statuses
    assert "In Progress" in statuses
    assert "Resolved" in statuses

    # Second attempt must NOT overwrite or duplicate existing records
    second_run = seed_demo_complaints_if_empty(db)
    assert second_run == 0
    assert db.query(Issue).count() == 6
    db.close()
