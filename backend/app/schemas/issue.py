from datetime import datetime
from typing import Optional, List, Dict, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.core.constants import ALLOWED_CATEGORIES, PRIORITY_LEVELS


class IssueBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=255, description="Brief summary of the issue")
    description: str = Field(..., min_length=10, description="Detailed description of the civic problem")
    location: str = Field(..., min_length=3, max_length=255, description="Street address, landmark, or intersection")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Optional GPS latitude (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Optional GPS longitude (-180 to 180)")
    citizen_category: str = Field(
        ...,
        description=f"Citizen-selected category. Allowed: {', '.join(ALLOWED_CATEGORIES)}"
    )

    @field_validator("citizen_category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        # Match case-insensitively or exact match
        for cat in ALLOWED_CATEGORIES:
            if v.strip().lower() == cat.lower():
                return cat
        # If not exact, allow if it contains valid keywords or default to Other
        return v.strip()


class IssueCreate(IssueBase):
    """Payload for submitting a civic issue via JSON."""
    image_path: Optional[str] = Field(None, description="Path or URL to uploaded photo evidence")


class IssueUpdate(BaseModel):
    """Payload for administrative updates to an issue."""
    status: Optional[str] = Field(
        None,
        description="Updated status (Submitted, Under Review, Assigned, In Progress, Resolved, Rejected)"
    )
    priority: Optional[Literal["Critical", "High", "Medium", "Low"]] = Field(
        None,
        description="Manual priority override (Critical, High, Medium, Low)"
    )
    recommended_department: Optional[str] = Field(None, description="Department reassignment")
    admin_notes: Optional[str] = Field(None, description="Internal notes from municipal staff")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    resolved_at: Optional[datetime] = None


class IssueResponse(IssueBase):
    """Complete representation of a civic issue."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    tracking_id: str
    image_path: Optional[str] = None
    ai_category: Optional[str] = None
    priority: Optional[str] = None
    urgency_reasoning: Optional[str] = None
    recommended_department: Optional[str] = None
    suggested_action: Optional[str] = None
    visual_observations: Optional[str] = None
    is_potential_duplicate: bool
    duplicate_note: Optional[str] = None
    status: str
    admin_notes: Optional[str] = None
    ai_mode: str
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    citizen_uid: Optional[str] = None


class PublicIssueFeedItem(BaseModel):
    """Sanitized public complaint representation for community feed. Zero PII or private metadata."""
    model_config = ConfigDict(from_attributes=True)

    category: str = Field(..., description="General civic issue category")
    description: str = Field(..., description="General description of the issue")
    location: str = Field(..., description="General area, sector, or locality")
    status: str = Field(..., description="Complaint status (Reported, In Progress, Resolved)")
    priority: Optional[str] = Field(None, description="Assessed priority level")
    created_at: datetime = Field(..., description="Reported date and timestamp")


class PublicIssuesFeedResponse(BaseModel):
    """Paginated response for public community feed with strictly sanitized fields."""
    total: int
    issues: List[PublicIssueFeedItem]


class IssueListResponse(BaseModel):
    """List response for paginated or filtered issues."""
    total: int
    issues: List[IssueResponse]


class IssueStatsSummary(BaseModel):
    """Statistical summary of issues for administrative dashboards."""
    total_issues: int
    by_status: Dict[str, int]
    by_priority: Dict[str, int]
    by_category: Dict[str, int] = {}
    by_department: Dict[str, int]
    duplicates_detected: int
    gemini_analyzed_count: int = 0
    fallback_demo_count: int = 0
