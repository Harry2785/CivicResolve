from typing import Optional, Literal
from pydantic import BaseModel, Field


class AIAnalysisResult(BaseModel):
    """
    Structured response model returned by Gemini AI complaint analysis.
    Adheres strictly to CivicResolve predefined categories, priorities,
    and department routing rules.
    """
    ai_category: Literal[
        "Roads & Potholes",
        "Sanitation & Waste",
        "Water & Drainage",
        "Streetlights & Electrical",
        "Public Safety",
        "Other"
    ] = Field(
        ...,
        description="Predefined category matching the primary issue: Roads & Potholes, Sanitation & Waste, Water & Drainage, Streetlights & Electrical, Public Safety, or Other"
    )

    priority: Literal[
        "Critical",
        "High",
        "Medium",
        "Low"
    ] = Field(
        ...,
        description="Four-tier priority level: Critical (Immediate serious public safety risk), High (Significant hazard or disruption), Medium (Moderate civic inconvenience), Low (Minor issue without immediate danger)"
    )

    urgency_reasoning: str = Field(
        ...,
        description="Detailed explanation of why this specific priority was assigned. For Critical or potentially life-threatening situations, this field MUST flag the issue for urgent human review and explicitly state that AI assistance is advisory and cannot determine emergencies with absolute certainty."
    )

    recommended_department: str = Field(
        ...,
        description="Responsible department. Defaults: Roads & Potholes -> Roads & Highways Department, Sanitation & Waste -> Municipal Sanitation Wing, Water & Drainage -> Water Supply & Sewerage Board, Streetlights & Electrical -> Electrical & Streetlight Maintenance, Public Safety -> Public Works & Safety, Other -> General Municipal Administration."
    )

    suggested_action: str = Field(
        ...,
        description="Concrete, actionable operational recommendation for municipal field dispatchers and crews."
    )

    visual_observations: Optional[str] = Field(
        default=None,
        description="Visual analysis of uploaded photo evidence (e.g. estimated crack depth, water accumulation, live wire exposure, debris volume) or physical indicators deduced from complaint description if no image was provided."
    )

    is_potential_duplicate: bool = Field(
        default=False,
        description="True if the complaint appears to describe an identical incident at the same location as existing active complaints."
    )

    duplicate_note: Optional[str] = Field(
        default=None,
        description="Details or tracking ID reference of the potential duplicate complaint."
    )
