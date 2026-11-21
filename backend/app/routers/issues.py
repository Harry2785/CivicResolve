import uuid
import shutil
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.database import get_db
from app.models.issue import Issue, generate_tracking_id
from app.schemas.issue import (
    IssueCreate,
    IssueUpdate,
    IssueResponse,
    IssueListResponse,
    IssueStatsSummary,
    PublicIssueFeedItem,
    PublicIssuesFeedResponse
)
from app.services.ai_service import analyze_complaint
from app.services.duplicate_service import find_nearby_candidates, evaluate_potential_duplicate
from app.services.image_service import validate_and_save_image
from app.core.config import settings
from app.core.auth import require_admin, get_current_user, optional_authenticated_user
from app.core.constants import (
    ALLOWED_CATEGORIES,
    PRIORITY_LEVELS,
    DEFAULT_DEPARTMENT_MAPPINGS,
    PRIORITY_DESCRIPTIONS
)

router = APIRouter(prefix="/issues", tags=["Civic Issues"])


@router.get("/meta/categories")
def get_categories_metadata():
    """Retrieve predefined categories, priorities, and default department mappings."""
    return {
        "categories": ALLOWED_CATEGORIES,
        "priorities": PRIORITY_LEVELS,
        "priority_descriptions": PRIORITY_DESCRIPTIONS,
        "department_mappings": DEFAULT_DEPARTMENT_MAPPINGS
    }


@router.post("", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue_json(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Submit a civic complaint via standard JSON payload.
    Restricted: Requires verified citizen or administrator authentication.
    Owner UID is cryptographically bound from the verified token.
    """
    return await _process_and_save_issue(
        db=db,
        citizen_uid=current_user["uid"],
        title=payload.title,
        description=payload.description,
        location=payload.location,
        citizen_category=payload.citizen_category,
        image_path=payload.image_path,
        latitude=payload.latitude,
        longitude=payload.longitude,
        image_bytes=None,
        mime_type=None
    )


@router.post("/upload", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue_with_upload(
    title: str = Form(...),
    description: str = Form(...),
    location: str = Form(...),
    citizen_category: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Submit a civic complaint with an optional photo file attachment.
    Restricted: Requires verified citizen or administrator authentication.
    Owner UID is cryptographically bound from the verified token.
    """
    image_path = None
    image_bytes = None
    mime_type = None

    if image and image.filename:
        raw_bytes = await image.read()
        if len(raw_bytes) > 0:
            image_path, mime_type, image_bytes = validate_and_save_image(
                file=image,
                image_bytes=raw_bytes,
                destination_dir=settings.UPLOAD_DIR
            )

    return await _process_and_save_issue(
        db=db,
        citizen_uid=current_user["uid"],
        title=title,
        description=description,
        location=location,
        citizen_category=citizen_category,
        image_path=image_path,
        latitude=latitude,
        longitude=longitude,
        image_bytes=image_bytes,
        mime_type=mime_type
    )


async def _process_and_save_issue(
    db: Session,
    citizen_uid: str,
    title: str,
    description: str,
    location: str,
    citizen_category: str,
    image_path: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    image_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None
) -> Issue:
    """Internal helper to coordinate duplicate detection, AI analysis, and DB persistence."""
    # Step 1: Detect potential nearby duplicate issues
    candidates = find_nearby_candidates(db, location=location, title=title, description=description)
    heuristic_dup, heuristic_note = evaluate_potential_duplicate(candidates, title=title, location=location)

    nearby_context = [
        {
            "id": c.id,
            "tracking_id": c.tracking_id,
            "title": c.title,
            "location": c.location,
            "status": c.status
        }
        for c in candidates
    ]

    # Step 2: Trigger AI-powered multi-modal analysis
    ai_result, ai_mode = analyze_complaint(
        title=title,
        description=description,
        location=location,
        citizen_category=citizen_category,
        image_bytes=image_bytes,
        mime_type=mime_type,
        nearby_issues=nearby_context
    )

    # Use AI duplicate determination if flagged, otherwise fall back to heuristic match
    is_duplicate = ai_result.is_potential_duplicate or heuristic_dup
    duplicate_note = ai_result.duplicate_note or heuristic_note

    # Step 3: Instantiate and persist the Issue model with verified owner UID
    issue = Issue(
        tracking_id=generate_tracking_id(),
        citizen_uid=citizen_uid,
        title=title.strip(),
        description=description.strip(),
        location=location.strip(),
        latitude=latitude,
        longitude=longitude,
        citizen_category=citizen_category.strip(),
        image_path=image_path,
        ai_category=ai_result.ai_category,
        priority=ai_result.priority,
        urgency_reasoning=ai_result.urgency_reasoning,
        recommended_department=ai_result.recommended_department,
        suggested_action=ai_result.suggested_action,
        visual_observations=ai_result.visual_observations,
        is_potential_duplicate=is_duplicate,
        duplicate_note=duplicate_note,
        status="Reported",
        ai_mode=ai_mode
    )

    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


@router.get("/feed", response_model=PublicIssuesFeedResponse)
def get_public_issues_feed(
    status: Optional[str] = Query(None, description="Filter by status (Reported, In Progress, Resolved)"),
    priority: Optional[str] = Query(None, description="Filter by priority (Critical, High, Medium, Low)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Keyword search"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    Public Community Issues Feed.
    Accessible without authentication.
    STRICT DATA MINIMIZATION: Returns only sanitized general categories, descriptions, areas,
    status, priority, and date.
    NEVER exposes tracking IDs, images, admin notes, citizen UIDs, or private metadata.
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
                Issue.location.ilike(search_pattern)
            )
        )

    total = query.count()
    raw_issues = query.order_by(Issue.created_at.desc()).offset(skip).limit(limit).all()

    sanitized = [
        PublicIssueFeedItem(
            category=i.citizen_category or i.ai_category or "Other",
            description=i.description,
            location=i.location,
            status=i.status or "Reported",
            priority=i.priority,
            created_at=i.created_at
        )
        for i in raw_issues
    ]

    return PublicIssuesFeedResponse(total=total, issues=sanitized)


@router.get("/my", response_model=IssueListResponse)
def get_my_issues(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Personal Complaints Endpoint for Authenticated Citizens.
    Strictly isolated: returns ONLY complaints submitted by the caller's Firebase UID.
    """
    uid = current_user.get("uid")
    query = db.query(Issue).filter(Issue.citizen_uid == uid)

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

    total = query.count()
    issues = query.order_by(Issue.created_at.desc()).offset(skip).limit(limit).all()
    return IssueListResponse(total=total, issues=issues)


@router.get("", response_model=None)
def list_issues(
    status: Optional[str] = Query(None, description="Filter by status (Reported, In Progress, Resolved)"),
    priority: Optional[str] = Query(None, description="Filter by priority (Critical, High, Medium, Low)"),
    category: Optional[str] = Query(None, description="Filter by category (matches citizen or AI category)"),
    citizen_category: Optional[str] = Query(None, description="Filter by citizen category"),
    ai_category: Optional[str] = Query(None, description="Filter by AI category"),
    department: Optional[str] = Query(None, description="Filter by recommended department"),
    is_duplicate: Optional[bool] = Query(None, description="Filter by potential duplicate status"),
    search: Optional[str] = Query(None, description="Keyword search in title, description, location, or tracking_id"),
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=200, description="Limit for pagination"),
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(optional_authenticated_user)
):
    """
    Complaints listing endpoint enforcing strict privacy & role boundaries:
    - If unauthenticated: Returns PublicIssuesFeedResponse with ONLY sanitized public fields (no tracking IDs, no PII).
    - If authenticated citizen: Returns IssueListResponse strictly filtered to caller's own citizen_uid.
    - If verified administrator: Returns IssueListResponse with all complaints.
    """
    # 1. Unauthenticated visitors get ONLY the sanitized public feed
    if not current_user:
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
                    Issue.location.ilike(search_pattern)
                )
            )

        total = query.count()
        raw_issues = query.order_by(Issue.created_at.desc()).offset(skip).limit(limit).all()
        sanitized = [
            PublicIssueFeedItem(
                category=i.citizen_category or i.ai_category or "Other",
                description=i.description,
                location=i.location,
                status=i.status or "Reported",
                priority=i.priority,
                created_at=i.created_at
            )
            for i in raw_issues
        ]
        return PublicIssuesFeedResponse(total=total, issues=sanitized)

    # 2. Authenticated user: check administrator status
    user_email = (current_user.get("email") or "").strip().lower()
    is_admin = bool(user_email and user_email in settings.admin_emails)

    query = db.query(Issue)
    if not is_admin:
        # Strict citizen privacy isolation: filter strictly by caller's citizen_uid
        query = query.filter(Issue.citizen_uid == current_user["uid"])

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
    if citizen_category:
        query = query.filter(Issue.citizen_category == citizen_category)
    if ai_category:
        query = query.filter(Issue.ai_category == ai_category)
    if department:
        query = query.filter(Issue.recommended_department.ilike(f"%{department}%"))
    if is_duplicate is not None:
        query = query.filter(Issue.is_potential_duplicate == is_duplicate)
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


def _calculate_stats_summary(db: Session) -> IssueStatsSummary:
    """Internal helper to calculate aggregated statistics for issues."""
    total_issues = db.query(Issue).count()

    # Status counts
    status_counts = db.query(Issue.status, func.count(Issue.id)).group_by(Issue.status).all()
    by_status = {s: count for s, count in status_counts}

    # Priority counts
    priority_counts = db.query(Issue.priority, func.count(Issue.id)).group_by(Issue.priority).all()
    by_priority = {p or "Unassigned": count for p, count in priority_counts}

    # Department counts
    dept_counts = db.query(Issue.recommended_department, func.count(Issue.id)).group_by(Issue.recommended_department).all()
    by_dept = {d or "Unassigned": count for d, count in dept_counts}

    # Category counts
    cat_counts = db.query(Issue.ai_category, func.count(Issue.id)).group_by(Issue.ai_category).all()
    by_category = {c or "Other": count for c, count in cat_counts}

    # Duplicates count
    duplicates_detected = db.query(Issue).filter(Issue.is_potential_duplicate == True).count()

    # Gemini vs Fallback Demo
    gemini_count = db.query(Issue).filter(Issue.ai_mode == "Gemini Live").count()
    fallback_count = db.query(Issue).filter(Issue.ai_mode == "Fallback Demo").count()

    return IssueStatsSummary(
        total_issues=total_issues,
        by_status=by_status,
        by_priority=by_priority,
        by_category=by_category,
        by_department=by_dept,
        duplicates_detected=duplicates_detected,
        gemini_analyzed_count=gemini_count,
        fallback_demo_count=fallback_count
    )


@router.get("/pulse")
def get_public_pulse(db: Session = Depends(get_db)):
    """
    Public city pulse metrics for citizen homepage.
    Does not expose sensitive administrator analytics or notes.
    """
    total_issues = db.query(Issue).count()
    status_counts = db.query(Issue.status, func.count(Issue.id)).group_by(Issue.status).all()
    by_status = {s: count for s, count in status_counts}
    duplicates_detected = db.query(Issue).filter(Issue.is_potential_duplicate == True).count()

    return {
        "total_issues": total_issues,
        "by_status": by_status,
        "duplicates_detected": duplicates_detected
    }


@router.get("/stats/summary", response_model=IssueStatsSummary)
def get_issue_stats(
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Aggregate statistics for municipal dashboards and metrics.
    Requires server-side administrator authorization.
    """
    return _calculate_stats_summary(db)


@router.get("/{identifier}", response_model=IssueResponse)
def get_issue(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieve an individual complaint by tracking ID (e.g. CR-20261121-ABC123) or integer ID.
    Strictly protected:
    - Requires authentication (401 if unauthenticated).
    - Permitted ONLY if caller is the verified complaint owner (citizen_uid matches) or an authorized administrator.
    - If complaint belongs to another citizen or is an inaccessible legacy record: returns HTTP 404 to avoid leaking existence.
    """
    if identifier.isdigit():
        issue = db.query(Issue).filter(Issue.id == int(identifier)).first()
    else:
        issue = db.query(Issue).filter(Issue.tracking_id == identifier).first()

    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Civic issue with identifier '{identifier}' not found."
        )

    user_email = (current_user.get("email") or "").strip().lower()
    is_admin = bool(user_email and user_email in settings.admin_emails)

    # Ownership check: must match owner UID or be verified admin
    if not is_admin and issue.citizen_uid != current_user.get("uid"):
        # Return 404 to avoid revealing the existence of other citizens' complaints
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Civic issue with identifier '{identifier}' not found."
        )

    return issue


@router.patch("/{id}", response_model=IssueResponse)
def update_issue(
    id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Update issue status, priority, department routing, or administrator notes.
    Requires verified municipal administrator credentials.
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
    if payload.priority is not None:
        issue.priority = payload.priority
    if payload.recommended_department is not None:
        issue.recommended_department = payload.recommended_department
    if payload.admin_notes is not None:
        issue.admin_notes = payload.admin_notes

    issue.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_issue(
    id: int,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Delete an issue by ID for administrative lifecycle management.
    Requires verified municipal administrator credentials.
    """
    issue = db.query(Issue).filter(Issue.id == id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue with ID {id} not found."
        )

    # Clean up uploaded image if present
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


@router.post("/{id}/reanalyze", response_model=IssueResponse)
def reanalyze_issue(
    id: int,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin)
):
    """
    Restricted: Trigger AI re-analysis on an existing complaint.
    Requires verified municipal administrator credentials.
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
