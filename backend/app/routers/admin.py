from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.database import get_db
from app.models.issue import Issue
from app.schemas.issue import (
    IssueUpdate,
    IssueResponse,
    IssueListResponse,
    IssueStatsSummary
)
from app.core.auth import require_admin
from app.core.config import settings
from app.services.ai_service import analyze_complaint

router = APIRouter(prefix="/admin", tags=["Administrator Operations"])


@router.get("/verify")
def verify_admin_status(admin_user: dict = Depends(require_admin)):
    """
    Verify whether the authenticated user has verified administrator access.
    Returns 200 OK with verified admin details, 401 if unauthenticated, 403 if unauthorized.
    """
    return {
        "status": "authorized",
        "email": admin_user["email"],
        "name": admin_user.get("name", admin_user["email"]),
        "role": "admin"
    }


@router.get("/issues", response_model=IssueListResponse)
def list_admin_issues(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: List all complaints for municipal administrator management.
    Requires verified municipal administrator token.
    """
    query = db.query(Issue)

    if status:
        query = query.filter(Issue.status == status)
    if priority:
        query = query.filter(Issue.priority == priority)
    if category:
        query = query.filter(
            or_(
                Issue.citizen_category.ilike(f"%{category}%"),
                Issue.ai_category.ilike(f"%{category}%")
            )
        )
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Issue.title.ilike(search_pattern),
                Issue.description.ilike(search_pattern),
                Issue.location.ilike(search_pattern),
                Issue.tracking_id.ilike(search_pattern)
            )
        )

    total = query.count()
    issues = query.order_by(Issue.created_at.desc()).offset(skip).limit(limit).all()

    return IssueListResponse(total=total, issues=issues)


@router.get("/stats", response_model=IssueStatsSummary)
def get_admin_stats(
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Access municipal analytics, breakdown counts, and administrative statistics.
    Requires verified municipal administrator token.
    """
    from app.routers.issues import _calculate_stats_summary
    return _calculate_stats_summary(db)


@router.patch("/issues/{id}", response_model=IssueResponse)
def update_admin_issue(
    id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Update issue status, priority, department, or administrator notes.
    Requires verified municipal administrator token.
    """
    from datetime import datetime, timezone

    issue = db.query(Issue).filter(Issue.id == id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue with ID {id} not found."
        )

    if payload.status is not None:
        issue.status = payload.status
        if payload.status == "Resolved" and not issue.resolved_at:
            issue.resolved_at = datetime.now(timezone.utc)
        elif payload.status != "Resolved":
            issue.resolved_at = None
    if payload.priority is not None:
        issue.priority = payload.priority
    if payload.recommended_department is not None:
        issue.recommended_department = payload.recommended_department
    if payload.admin_notes is not None:
        issue.admin_notes = payload.admin_notes
    if payload.latitude is not None:
      issue.latitude = payload.latitude
    if payload.longitude is not None:
      issue.longitude = payload.longitude
    if payload.resolved_at is not None:
      issue.resolved_at = payload.resolved_at

    issue.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/issues/{id}", status_code=status.HTTP_200_OK)
def delete_admin_issue(
    id: int,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Delete an issue.
    Requires verified municipal administrator token.
    """
    issue = db.query(Issue).filter(Issue.id == id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue with ID {id} not found."
        )

    if issue.image_path:
        filename = Path(issue.image_path).name
        file_path = settings.UPLOAD_DIR / filename
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass

    tracking_id = issue.tracking_id
    db.delete(issue)
    db.commit()
    return {"message": f"Issue {id} ({tracking_id}) deleted successfully."}


@router.post("/issues/{id}/reanalyze", response_model=IssueResponse)
def reanalyze_admin_issue(
    id: int,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Trigger AI re-analysis on an existing complaint.
    Requires verified municipal administrator token.
    """
    issue = db.query(Issue).filter(Issue.id == id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue with ID {id} not found."
        )

    ai_result, ai_mode = analyze_complaint(
        title=issue.title,
        description=issue.description,
        location=issue.location,
        citizen_category=issue.citizen_category
    )

    issue.ai_category = ai_result.ai_category
    issue.priority = ai_result.priority
    issue.urgency_reasoning = ai_result.urgency_reasoning
    issue.recommended_department = ai_result.recommended_department
    issue.suggested_action = ai_result.suggested_action
    issue.visual_observations = ai_result.visual_observations
    issue.ai_mode = ai_mode

    db.commit()
    db.refresh(issue)
    return issue
