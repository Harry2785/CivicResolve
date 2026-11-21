import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal, init_db
from app.models.issue import Issue, generate_tracking_id
from app.services.hotspot_service import haversine_distance_meters

client = TestClient(app)

ADMIN_HEADERS = {"Authorization": "Bearer test-admin:shrihari0877@gmail.com"}
CITIZEN_HEADERS = {"Authorization": "Bearer test-citizen:citizen@example.com"}


def test_analytics_endpoints_require_admin():
    """Verify all analytics endpoints require verified admin token."""
    endpoints = [
        "/api/analytics/departments",
        "/api/analytics/trends",
        "/api/analytics/hotspots"
    ]
    for ep in endpoints:
        # 1. Unauthenticated -> 401
        res_unauth = client.get(ep)
        assert res_unauth.status_code == 401, f"{ep} allowed unauthenticated access"

        # 2. Citizen role -> 403
        res_citizen = client.get(ep, headers=CITIZEN_HEADERS)
        assert res_citizen.status_code == 403, f"{ep} allowed citizen role access"

        # 3. Admin role -> 200
        res_admin = client.get(ep, headers=ADMIN_HEADERS)
        assert res_admin.status_code == 200, f"{ep} failed for authorized admin: {res_admin.text}"


def test_haversine_formula_accuracy():
    """Verify Haversine distance calculation matches real-world distance."""
    # Bangalore City Center (12.9716, 77.5946) to Cubbon Park (12.9763, 77.5929) is ~550m
    dist = haversine_distance_meters(12.9716, 77.5946, 12.9763, 77.5929)
    assert 500 < dist < 600, f"Expected ~550m, got {dist}"

    # Same point distance must be 0
    assert haversine_distance_meters(12.9716, 77.5946, 12.9716, 77.5946) == 0.0


def test_coordinate_validation_on_issue_creation():
    """Verify that coordinates outside [-90, 90] or [-180, 180] are rejected."""
    # Invalid latitude > 90
    bad_payload = {
        "title": "Invalid GPS latitude test",
        "description": "Attempting to create complaint with out of bounds latitude.",
        "location": "North Pole Beyond",
        "citizen_category": "Roads & Potholes",
        "latitude": 95.5,
        "longitude": 77.59
    }
    res = client.post("/api/issues", json=bad_payload, headers=CITIZEN_HEADERS)
    assert res.status_code == 422, "Latitude > 90 was not rejected"

    # Valid coordinates succeed
    valid_payload = {
        "title": "Valid GPS location complaint",
        "description": "Pothole at verified intersection coordinates.",
        "location": "Main Road Corner",
        "citizen_category": "Roads & Potholes",
        "latitude": 12.9716,
        "longitude": 77.5946
    }
    res_ok = client.post("/api/issues", json=valid_payload, headers=CITIZEN_HEADERS)
    assert res_ok.status_code == 201
    data = res_ok.json()
    assert data["latitude"] == 12.9716
    assert data["longitude"] == 77.5946


def test_hotspot_clustering_and_critical_detection():
    """
    Test geographical clustering with a clean synthetic test dataset:
    - 3 nearby issues within 100m -> forms 1 cluster
    - 1 isolated issue 5km away -> isolated
    - 1 issue with NULL coordinates -> ignored in spatial clustering
    """
    db: Session = SessionLocal()
    # Tag complaints with SYNTHETIC_TEST_TAG so they are identifiable
    tag = "[SYNTHETIC-TEST-HOTSPOT]"
    now = datetime.now(timezone.utc)

    # Clean previous test tag items if any
    db.query(Issue).filter(Issue.title.like(f"%{tag}%")).delete(synchronize_session=False)
    db.commit()

    # Create 3 points in a tight cluster near Sector 18 (12.9720, 77.5950)
    # Point 1: Critical exposed wire
    i1 = Issue(
        tracking_id=generate_tracking_id(),
        title=f"{tag} Exposed sparking wire near park",
        description="Live sparking conductor suspended low.",
        location="Sector 18 Commercial Street",
        citizen_category="Streetlights & Electrical",
        ai_category="Streetlights & Electrical",
        priority="Critical",
        recommended_department="Electrical & Streetlight Maintenance",
        status="Reported",
        ai_mode="Fallback Demo",
        latitude=12.9720,
        longitude=77.5950,
        created_at=now
    )
    # Point 2: High priority water burst (50m away)
    i2 = Issue(
        tracking_id=generate_tracking_id(),
        title=f"{tag} Flooding water line burst",
        description="Drinking water main fractured.",
        location="Sector 18 Commercial Street 4B",
        citizen_category="Water & Drainage",
        ai_category="Water & Drainage",
        priority="High",
        recommended_department="Water Supply & Sewerage Board",
        status="In Progress",
        ai_mode="Fallback Demo",
        latitude=12.9723,
        longitude=77.5952,
        created_at=now - timedelta(hours=2)
    )
    # Point 3: Medium pothole (80m away)
    i3 = Issue(
        tracking_id=generate_tracking_id(),
        title=f"{tag} Deep pothole in right lane",
        description="Large asphalt depression.",
        location="Sector 18 Commercial Street 8",
        citizen_category="Roads & Potholes",
        ai_category="Roads & Potholes",
        priority="Medium",
        recommended_department="Roads & Highways Department",
        status="Resolved",
        ai_mode="Fallback Demo",
        latitude=12.9725,
        longitude=77.5954,
        created_at=now - timedelta(hours=10),
        resolved_at=now - timedelta(hours=2)
    )
    # Point 4: Isolated issue 8 kilometers away
    i4 = Issue(
        tracking_id=generate_tracking_id(),
        title=f"{tag} Isolated streetlight out in suburbs",
        description="Single fixture not functioning.",
        location="Suburban Colony East",
        citizen_category="Streetlights & Electrical",
        ai_category="Streetlights & Electrical",
        priority="Low",
        recommended_department="Electrical & Streetlight Maintenance",
        status="Reported",
        ai_mode="Fallback Demo",
        latitude=12.9100,
        longitude=77.6600,
        created_at=now - timedelta(hours=1)
    )
    # Point 5: Non-geocoded complaint (NULL coordinates)
    i5 = Issue(
        tracking_id=generate_tracking_id(),
        title=f"{tag} Non-geocoded complaint with text address only",
        description="Address entered by citizen without GPS access.",
        location="Old Fort Road, Lane 3",
        citizen_category="Public Safety",
        ai_category="Public Safety",
        priority="High",
        recommended_department="Public Works & Safety",
        status="Reported",
        ai_mode="Fallback Demo",
        latitude=None,
        longitude=None,
        created_at=now
    )

    db.add_all([i1, i2, i3, i4, i5])
    db.commit()

    try:
        # Request hotspots with radius 500m
        res = client.get("/api/analytics/hotspots?radius_meters=500", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()

        assert data["total_geocoded_complaints"] >= 4
        assert data["total_non_geocoded_complaints"] >= 1
        assert data["cluster_count"] >= 1

        # Locate the cluster containing our synthetic points
        synthetic_cluster = None
        for c in data["hotspots"]:
            if any(tag in comp["title"] for comp in c["complaints"]):
                synthetic_cluster = c
                break

        assert synthetic_cluster is not None, "Synthetic cluster was not detected"
        assert synthetic_cluster["complaint_count"] >= 3
        assert synthetic_cluster["has_critical_hazard"] is True, "Critical hazard was not flagged"
        assert synthetic_cluster["critical_or_high_count"] >= 2
        assert "Electrical & Streetlight Maintenance" in synthetic_cluster["departments_involved"]

        # Verify isolated complaint is in isolated_complaints list
        isolated_titles = [comp["title"] for comp in data["isolated_complaints"]]
        assert any(tag in t for t in isolated_titles)

    finally:
        # Cleanup synthetic test data
        db.query(Issue).filter(Issue.title.like(f"%{tag}%")).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_department_sla_and_resolution_calculations():
    """Verify department performance math: SLA compliance, overdue detection, rankings."""
    res = client.get("/api/analytics/departments", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    data = res.json()

    assert "summary" in data
    assert "departments" in data
    assert len(data["departments"]) == 6  # All 6 official departments present
    assert "rankings" in data
    assert "insights" in data
    assert len(data["insights"]) >= 1

    # Check that each department has valid calculated rates (0 to 100)
    for d in data["departments"]:
        assert 0.0 <= d["resolution_rate"] <= 100.0
        assert 0.0 <= d["within_sla_rate"] <= 100.0
        assert d["reported"] >= 0
        assert d["in_progress"] >= 0
        assert d["resolved"] >= 0
        assert d["overdue"] >= 0
        assert d["total_assigned"] == d["reported"] + d["in_progress"] + d["resolved"]
