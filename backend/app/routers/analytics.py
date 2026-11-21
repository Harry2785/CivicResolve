import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.auth import require_admin
from app.schemas.analytics import (
    DepartmentAnalyticsResponse,
    AnalyticsTrendsResponse,
    HotspotsResponse,
    HotspotCluster
)
from app.services.analytics_service import (
    calculate_department_analytics,
    calculate_complaint_trends
)
from app.services.hotspot_service import detect_hotspots

logger = logging.getLogger("civicresolve.analytics.api")

router = APIRouter(prefix="/analytics", tags=["Municipal Analytics & Hotspot Intelligence"])


@router.get("/departments", response_model=DepartmentAnalyticsResponse)
def get_department_performance(
    date_from: Optional[datetime] = Query(None, description="Start date filter (ISO format)"),
    date_to: Optional[datetime] = Query(None, description="End date filter (ISO format)"),
    priority: Optional[str] = Query(None, description="Priority filter (Critical, High, Medium, Low)"),
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Calculate real-time department performance metrics, SLA compliance rates,
    average resolution times, rankings, and actionable insights.
    Requires verified municipal administrator authorization.
    """
    logger.info(f"Admin '{admin_user.get('email')}' requested department analytics.")
    return calculate_department_analytics(
        db=db,
        date_from=date_from,
        date_to=date_to,
        priority=priority
    )


@router.get("/trends", response_model=AnalyticsTrendsResponse)
def get_complaint_trends(
    days: int = Query(30, ge=7, le=365, description="Number of past days to aggregate trends for"),
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Retrieve daily time-series trends (received, in-progress, resolved)
    along with priority and category distributions.
    Requires verified municipal administrator authorization.
    """
    logger.info(f"Admin '{admin_user.get('email')}' requested complaint trends for {days} days.")
    return calculate_complaint_trends(db=db, days=days)


@router.get("/hotspots", response_model=HotspotsResponse)
def get_geographic_hotspots(
    radius_meters: float = Query(500.0, ge=50.0, le=10000.0, description="Spatial clustering radius in meters"),
    category: Optional[str] = Query(None, description="Filter by issue category"),
    status: Optional[str] = Query(None, description="Filter by status (Reported, In Progress, Resolved)"),
    department: Optional[str] = Query(None, description="Filter by responsible department"),
    priority: Optional[str] = Query(None, description="Filter by priority level"),
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Detect geographic civic issue hotspots using distance-based spatial clustering
    on actual complaint GPS coordinates stored in SQLite. Returns clusters, isolated points, and heatmap data.
    Requires verified municipal administrator authorization.
    """
    logger.info(f"Admin '{admin_user.get('email')}' requested hotspot detection (radius: {radius_meters}m).")
    return detect_hotspots(
        db=db,
        radius_meters=radius_meters,
        category=category,
        status=status,
        department=department,
        priority=priority
    )


@router.get("/hotspots/{id}", response_model=HotspotCluster)
def get_hotspot_details(
    id: str,
    radius_meters: float = Query(500.0, ge=50.0, le=10000.0),
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Retrieve comprehensive details, member complaint list, and intelligent recommendations
    for a specific hotspot cluster ID (e.g. HS-01).
    Requires verified municipal administrator authorization.
    """
    result = detect_hotspots(db=db, radius_meters=radius_meters)
    for cluster in result.hotspots:
        if cluster.id.upper() == id.upper():
            return cluster

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Hotspot cluster with ID '{id}' not found under current clustering radius."
    )
