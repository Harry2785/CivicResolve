import math
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.models.issue import Issue
from app.schemas.analytics import (
    HotspotCluster,
    HotspotComplaintSummary,
    HotspotsResponse
)

logger = logging.getLogger("civicresolve.hotspots")

# Priority weighting for heatmap density calculation
PRIORITY_WEIGHTS: Dict[str, float] = {
    "Critical": 1.0,
    "High": 0.75,
    "Medium": 0.5,
    "Low": 0.25
}


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two GPS coordinates using the Haversine formula.
    Returns distance in meters.
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2 +
        math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def detect_hotspots(
    db: Session,
    radius_meters: float = 500.0,
    category: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    priority: Optional[str] = None
) -> HotspotsResponse:
    """
    Detect geographic civic issue hotspots using distance-based spatial clustering
    on actual complaint coordinates stored in SQLite.

    Guarantees:
    - Never fabricates coordinates for complaints lacking GPS data.
    - Does not merge or delete complaints.
    - Accurately distinguishes isolated issues from dense clusters.
    """
    # Base query for all complaints
    all_query = db.query(Issue)
    if category:
        all_query = all_query.filter(
            (Issue.citizen_category.ilike(f"%{category}%")) |
            (Issue.ai_category.ilike(f"%{category}%"))
        )
    if status:
        all_query = all_query.filter(Issue.status == status)
    if department:
        all_query = all_query.filter(Issue.recommended_department.ilike(f"%{department}%"))
    if priority:
        all_query = all_query.filter(Issue.priority == priority)

    all_issues: List[Issue] = all_query.all()

    # Separate geocoded complaints from complaints lacking coordinates
    geocoded_issues: List[Issue] = [
        i for i in all_issues
        if i.latitude is not None and i.longitude is not None
        and -90.0 <= i.latitude <= 90.0 and -180.0 <= i.longitude <= 180.0
    ]
    non_geocoded_count = len(all_issues) - len(geocoded_issues)

    if not geocoded_issues:
        return HotspotsResponse(
            total_geocoded_complaints=0,
            total_non_geocoded_complaints=non_geocoded_count,
            cluster_count=0,
            radius_meters=radius_meters,
            hotspots=[],
            heatmap_points=[],
            isolated_complaints=[]
        )

    # Convert issues to summary dicts
    summaries: List[HotspotComplaintSummary] = [
        HotspotComplaintSummary(
            id=i.id,
            tracking_id=i.tracking_id,
            title=i.title,
            priority=i.priority or "Medium",
            status=i.status or "Reported",
            citizen_category=i.citizen_category,
            ai_category=i.ai_category,
            recommended_department=i.recommended_department,
            location=i.location,
            latitude=i.latitude,
            longitude=i.longitude,
            created_at=i.created_at,
            image_path=i.image_path
        )
        for i in geocoded_issues
    ]

    # Build adjacency graph based on Haversine distance <= radius_meters
    n = len(summaries)
    adj: Dict[int, List[int]] = {idx: [] for idx in range(n)}

    for i in range(n):
        for j in range(i + 1, n):
            dist = haversine_distance_meters(
                summaries[i].latitude, summaries[i].longitude,
                summaries[j].latitude, summaries[j].longitude
            )
            if dist <= radius_meters:
                adj[i].append(j)
                adj[j].append(i)

    # Find connected components (geographic clusters)
    visited = set()
    components: List[List[int]] = []

    for idx in range(n):
        if idx not in visited:
            component = []
            queue = [idx]
            visited.add(idx)

            while queue:
                curr = queue.pop(0)
                component.append(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)

            components.append(component)

    # Separate clusters (size >= 2) from isolated complaints (size == 1)
    hotspots: List[HotspotCluster] = []
    isolated_complaints: List[HotspotComplaintSummary] = []
    cluster_idx = 1

    for comp in components:
        comp_summaries = [summaries[i] for i in comp]

        if len(comp_summaries) >= 2:
            cluster = _build_hotspot_cluster(
                cluster_id=f"HS-{cluster_idx:02d}",
                summaries=comp_summaries,
                requested_radius=radius_meters
            )
            hotspots.append(cluster)
            cluster_idx += 1
        else:
            isolated_complaints.append(comp_summaries[0])

    # Sort hotspots: Critical hazard first, then highest complaint count
    hotspots.sort(key=lambda h: (h.has_critical_hazard, h.critical_or_high_count, h.complaint_count), reverse=True)

    # Generate heatmap points: [lat, lng, weight]
    heatmap_points: List[List[float]] = []
    for s in summaries:
        w = PRIORITY_WEIGHTS.get(s.priority, 0.5)
        heatmap_points.append([s.latitude, s.longitude, w])

    return HotspotsResponse(
        total_geocoded_complaints=len(geocoded_issues),
        total_non_geocoded_complaints=non_geocoded_count,
        cluster_count=len(hotspots),
        radius_meters=radius_meters,
        hotspots=hotspots,
        heatmap_points=heatmap_points,
        isolated_complaints=isolated_complaints
    )


def _build_hotspot_cluster(
    cluster_id: str,
    summaries: List[HotspotComplaintSummary],
    requested_radius: float
) -> HotspotCluster:
    """Helper to aggregate cluster metrics and generate intelligent recommendations."""
    # Compute center coordinates (centroid)
    center_lat = sum(s.latitude for s in summaries) / len(summaries)
    center_lon = sum(s.longitude for s in summaries) / len(summaries)

    # Calculate actual spatial span (max distance from center to member)
    max_dist = max(
        haversine_distance_meters(center_lat, center_lon, s.latitude, s.longitude)
        for s in summaries
    )
    # Ensure minimum visible radius for map display
    cluster_radius = max(max_dist, 60.0)

    # Category frequencies
    cat_counts: Dict[str, int] = {}
    for s in summaries:
        cat = s.ai_category or s.citizen_category or "Other"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    dominant_cat = max(cat_counts.items(), key=lambda x: x[1])[0]

    # Priority breakdown
    priority_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for s in summaries:
        pr = s.priority or "Medium"
        priority_counts[pr] = priority_counts.get(pr, 0) + 1

    crit_high_count = priority_counts["Critical"] + priority_counts["High"]
    has_crit = priority_counts["Critical"] > 0

    # Departments involved
    depts = sorted(list({s.recommended_department for s in summaries if s.recommended_department}))
    if not depts:
        depts = ["General Municipal Administration"]

    # Status breakdown
    status_counts = {"Reported": 0, "In Progress": 0, "Resolved": 0}
    unresolved_created_times: List[datetime] = []
    for s in summaries:
        st = s.status or "Reported"
        status_counts[st] = status_counts.get(st, 0) + 1
        if st != "Resolved" and s.created_at:
            unresolved_created_times.append(s.created_at)

    open_count = status_counts["Reported"] + status_counts["In Progress"]
    resolved_count = status_counts["Resolved"]

    oldest_unresolved = min(unresolved_created_times) if unresolved_created_times else None

    # Name derived from common locality or dominant category
    locality = _derive_cluster_name(summaries, dominant_cat)
    cluster_name = f"{locality} ({dominant_cat} Cluster)"

    # Generate actionable recommendation
    recommendation, source = _generate_hotspot_recommendation(
        cluster_name=cluster_name,
        dominant_cat=dominant_cat,
        priority_counts=priority_counts,
        complaint_count=len(summaries),
        open_count=open_count,
        departments=depts
    )

    return HotspotCluster(
        id=cluster_id,
        name=cluster_name,
        center_latitude=round(center_lat, 6),
        center_longitude=round(center_lon, 6),
        radius_meters=round(cluster_radius, 1),
        complaint_count=len(summaries),
        dominant_category=dominant_cat,
        priority_breakdown=priority_counts,
        critical_or_high_count=crit_high_count,
        has_critical_hazard=has_crit,
        departments_involved=depts,
        status_breakdown=status_counts,
        open_count=open_count,
        resolved_count=resolved_count,
        oldest_unresolved_created_at=oldest_unresolved,
        ai_recommendation=recommendation,
        recommendation_source=source,
        complaints=summaries
    )


def _derive_cluster_name(summaries: List[HotspotComplaintSummary], dominant_cat: str) -> str:
    """Derive a human-friendly locality label from member complaint addresses."""
    # Look for common road or sector keyword
    words: List[str] = []
    for s in summaries:
        parts = [p.strip() for p in s.location.split(",") if p.strip()]
        if parts:
            words.append(parts[0])

    if words:
        # Use first concise landmark
        candidate = words[0]
        if len(candidate) > 28:
            candidate = candidate[:28] + "..."
        return candidate
    return f"{dominant_cat} Zone"


def _generate_hotspot_recommendation(
    cluster_name: str,
    dominant_cat: str,
    priority_counts: Dict[str, int],
    complaint_count: int,
    open_count: int,
    departments: List[str]
) -> Tuple[str, str]:
    """
    Generate actionable municipal recommendations for a detected hotspot.
    Combines rule-based civic dispatch logic with optional Gemini AI synthesis.
    """
    crit = priority_counts.get("Critical", 0)
    high = priority_counts.get("High", 0)
    dept_str = ", ".join(departments[:2])

    if crit > 0:
        return (
            f"URGENT PUBLIC SAFETY ALERT: {crit} Critical hazard(s) concentrated in this vicinity. "
            f"Recommend emergency multi-agency dispatch with {dept_str} to isolate hazards and cordon the area immediately.",
            "rule-based (safety-priority)"
        )

    if dominant_cat == "Roads & Potholes":
        return (
            f"Repeated road defect reports ({complaint_count} complaints) suggest sub-base pavement deterioration along this stretch. "
            f"Recommend scheduling a comprehensive structural resurfacing assessment with the Roads Department rather than localized cold-mix patching.",
            "rule-based (infrastructure)"
        )
    elif dominant_cat == "Sanitation & Waste":
        return (
            f"High volume of refuse complaints concentrated in this locality. "
            f"Recommend adjusting sanitation truck collection frequency and evaluating placement of an additional secondary commercial container.",
            "rule-based (sanitation)"
        )
    elif dominant_cat == "Water & Drainage":
        return (
            f"Multiple water and drainage complaints indicate possible distribution line pressure irregularities or clogged stormwater drains. "
            f"Recommend deploying a pipe diagnostic team with acoustic leak detection equipment.",
            "rule-based (utilities)"
        )
    elif dominant_cat == "Streetlights & Electrical":
        return (
            f"Cluster of electrical and lighting defects ({complaint_count} complaints). "
            f"Recommend an electrical circuit load audit and transformer inspection along this street corridor.",
            "rule-based (electrical)"
        )
    else:
        return (
            f"Concentration of {complaint_count} civic issues identified. "
            f"Recommend coordinating an inter-departmental field review by {dept_str} to clear the {open_count} active complaints.",
            "rule-based (general)"
        )
