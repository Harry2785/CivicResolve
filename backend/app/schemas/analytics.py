from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class DepartmentPerformance(BaseModel):
    """Detailed performance metrics for a single municipal department."""
    department_name: str
    total_assigned: int = 0
    reported: int = 0
    in_progress: int = 0
    resolved: int = 0
    overdue: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    avg_resolution_hours: Optional[float] = None
    resolution_rate: float = 0.0
    within_sla_rate: float = 0.0
    performance_rank: int = 1


class MunicipalSummary(BaseModel):
    """City-wide executive analytics summary."""
    total_complaints: int = 0
    overall_resolution_rate: float = 0.0
    overall_sla_compliance_rate: float = 0.0
    total_overdue: int = 0
    top_performing_department: Optional[str] = None
    highest_backlog_department: Optional[str] = None


class DepartmentAnalyticsResponse(BaseModel):
    """Response payload for GET /api/analytics/departments."""
    summary: MunicipalSummary
    departments: List[DepartmentPerformance]
    rankings: List[Dict[str, Any]]
    insights: List[str]


class TrendDataPoint(BaseModel):
    """Single time-series point for complaint activity."""
    date: str
    received: int = 0
    resolved: int = 0
    in_progress: int = 0


class AnalyticsTrendsResponse(BaseModel):
    """Response payload for GET /api/analytics/trends."""
    period: str
    trends: List[TrendDataPoint]
    priority_distribution: Dict[str, int]
    category_distribution: Dict[str, int]
    status_distribution: Dict[str, int]


class HotspotComplaintSummary(BaseModel):
    """Summary of an individual complaint within a hotspot."""
    id: int
    tracking_id: str
    title: str
    priority: str
    status: str
    citizen_category: str
    ai_category: Optional[str] = None
    recommended_department: Optional[str] = None
    location: str
    latitude: float
    longitude: float
    created_at: datetime
    image_path: Optional[str] = None


class HotspotCluster(BaseModel):
    """Geographic cluster representing a concentration of civic complaints."""
    id: str
    name: str
    center_latitude: float
    center_longitude: float
    radius_meters: float
    complaint_count: int
    dominant_category: str
    priority_breakdown: Dict[str, int]
    critical_or_high_count: int
    has_critical_hazard: bool
    departments_involved: List[str]
    status_breakdown: Dict[str, int]
    open_count: int
    resolved_count: int
    oldest_unresolved_created_at: Optional[datetime] = None
    ai_recommendation: str
    recommendation_source: str = "rule-based"
    complaints: List[HotspotComplaintSummary] = []


class HotspotsResponse(BaseModel):
    """Response payload for GET /api/analytics/hotspots."""
    total_geocoded_complaints: int
    total_non_geocoded_complaints: int
    cluster_count: int
    radius_meters: float
    hotspots: List[HotspotCluster]
    heatmap_points: List[List[float]]
    isolated_complaints: List[HotspotComplaintSummary] = []
