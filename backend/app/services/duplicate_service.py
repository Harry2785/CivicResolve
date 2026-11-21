from typing import List, Tuple, Optional
import re
from sqlalchemy.orm import Session
from app.models.issue import Issue


def normalize_text(text: str) -> set:
    """Extract lowercase alphanumeric tokens for similarity comparison."""
    if not text:
        return set()
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
    # Exclude common stopwords
    stopwords = {"the", "a", "an", "in", "on", "at", "near", "opposite", "road", "street", "is", "and", "of", "to"}
    return {token for token in cleaned.split() if token and token not in stopwords and len(token) > 2}


def find_nearby_candidates(
    db: Session,
    location: str,
    title: str,
    description: str,
    limit: int = 5
) -> List[Issue]:
    """
    Search SQLite for recently submitted or active issues that share
    location keywords or core topic tokens.
    """
    loc_tokens = normalize_text(location)
    desc_tokens = normalize_text(f"{title} {description}")

    # Fetch recent open complaints (Reported or In Progress)
    active_issues = (
        db.query(Issue)
        .filter(Issue.status.in_(["Reported", "In Progress"]))
        .order_by(Issue.created_at.desc())
        .limit(50)
        .all()
    )

    candidates = []
    for issue in active_issues:
        issue_loc_tokens = normalize_text(issue.location)
        issue_desc_tokens = normalize_text(f"{issue.title} {issue.description}")

        # Check location token overlap
        loc_overlap = loc_tokens.intersection(issue_loc_tokens)
        desc_overlap = desc_tokens.intersection(issue_desc_tokens)

        # High location similarity + topic similarity indicates strong candidate
        if loc_overlap and desc_overlap:
            candidates.append(issue)
        elif len(loc_overlap) >= 2:
            candidates.append(issue)

        if len(candidates) >= limit:
            break

    return candidates


def evaluate_potential_duplicate(
    candidates: List[Issue],
    title: str,
    location: str
) -> Tuple[bool, Optional[str]]:
    """
    Heuristically evaluate if the new complaint is a likely duplicate
    of an existing candidate.
    """
    if not candidates:
        return False, None

    primary_match = candidates[0]
    return (
        True,
        f"Potential duplicate of active issue '{primary_match.title}' at '{primary_match.location}' "
        f"(Tracking ID: {primary_match.tracking_id}, Status: {primary_match.status})."
    )
