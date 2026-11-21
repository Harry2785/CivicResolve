import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float
from app.database import Base


def generate_tracking_id() -> str:
    """
    Generate a human-readable, unique civic complaint tracking ID.
    Format: CR-YYYYMMDD-XXXXXX (e.g. CR-20261121-7A3F9C)
    """
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_suffix = uuid.uuid4().hex[:6].upper()
    return f"CR-{date_str}-{random_suffix}"


class Issue(Base):
    """
    SQLAlchemy Model representing a citizen civic complaint.
    Stores citizen-provided details, AI-analyzed insights, priority,
    routing recommendations, duplicate flags, and administrative status.
    """
    __tablename__ = "issues"

    # Primary key & tracking
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tracking_id = Column(String(32), unique=True, index=True, nullable=False, default=generate_tracking_id)

    # Citizen inputs & ownership
    citizen_uid = Column(String(128), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    location = Column(String(255), nullable=False, index=True)
    latitude = Column(Float, nullable=True, index=True)
    longitude = Column(Float, nullable=True, index=True)
    citizen_category = Column(String(100), nullable=False, index=True)
    image_path = Column(Text, nullable=True)

    # AI-powered triage and analysis
    ai_category = Column(String(100), nullable=True, index=True)
    priority = Column(String(50), nullable=True, default="Medium", index=True)
    urgency_reasoning = Column(Text, nullable=True)
    recommended_department = Column(String(150), nullable=True, index=True)
    suggested_action = Column(Text, nullable=True)
    visual_observations = Column(Text, nullable=True)

    # Duplicate detection
    is_potential_duplicate = Column(Boolean, default=False, nullable=False)
    duplicate_note = Column(Text, nullable=True)

    # Operational lifecycle & tracking (Reported, In Progress, Resolved)
    status = Column(String(50), default="Reported", nullable=False, index=True)
    admin_notes = Column(Text, nullable=True)
    ai_mode = Column(String(50), default="Fallback Demo", nullable=False)

    # Audit timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    resolved_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    def __repr__(self) -> str:
        return f"<Issue(id={self.id}, tracking_id='{self.tracking_id}', title='{self.title[:30]}', priority='{self.priority}')>"
