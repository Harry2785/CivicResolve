import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from app.models.issue import Issue
from app.core.constants import (
    ALLOWED_CATEGORIES,
    PRIORITY_LEVELS,
    DEFAULT_DEPARTMENT_MAPPINGS
)
from app.schemas.analytics import (
    DepartmentPerformance,
    MunicipalSummary,
    DepartmentAnalyticsResponse,
    TrendDataPoint,
    AnalyticsTrendsResponse
)
from app.core.config import settings

logger = logging.getLogger("civicresolve.analytics")

# Standard Municipal SLA targets in hours based on priority
PRIORITY_SLA_HOURS: Dict[str, float] = {
    "Critical": 48.0,    # 2 days max
    "High": 72.0,        # 3 days max
    "Medium": 120.0,     # 5 days max
    "Low": 168.0         # 7 days max
}

# The 6 official municipal departments
ALL_DEPARTMENTS: List[str] = [
    "Roads & Highways Department",
    "Municipal Sanitation Wing",
    "Water Supply & Sewerage Board",
    "Electrical & Streetlight Maintenance",
    "Public Works & Safety",
    "General Municipal Administration"
]


def calculate_department_analytics(
    db: Session,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    priority: Optional[str] = None
) -> DepartmentAnalyticsResponse:
    """
    Compute rigorous department-wise performance analytics from actual SQLite complaint records.
    Never uses fabricated or hardcoded statistics.
    """
    now = datetime.now(timezone.utc)

    # Base query with optional filters
    query = db.query(Issue)
    if date_from:
        query = query.filter(Issue.created_at >= date_from)
    if date_to:
        query = query.filter(Issue.created_at <= date_to)
    if priority and priority in PRIORITY_LEVELS:
        query = query.filter(Issue.priority == priority)

    issues: List[Issue] = query.all()

    # Group issues by department
    dept_map: Dict[str, List[Issue]] = {dept: [] for dept in ALL_DEPARTMENTS}
    for issue in issues:
        dept = issue.recommended_department or "General Municipal Administration"
        if dept not in dept_map:
            dept_map[dept] = []
        dept_map[dept].append(issue)

    dept_stats_list: List[DepartmentPerformance] = []
    total_complaints = len(issues)
    total_resolved_all = 0
    total_overdue_all = 0
    total_resolved_within_sla_all = 0
    total_resolved_with_sla_trackable = 0

    for dept_name, dept_issues in dept_map.items():
        total_assigned = len(dept_issues)
        reported = 0
        in_progress = 0
        resolved = 0
        overdue = 0
        crit_count = 0
        high_count = 0
        med_count = 0
        low_count = 0

        resolution_times_hours: List[float] = []
        resolved_within_sla_count = 0

        for issue in dept_issues:
            # Status breakdown
            st = (issue.status or "Reported").strip()
            if st == "Reported":
                reported += 1
            elif st == "In Progress":
                in_progress += 1
            elif st == "Resolved":
                resolved += 1
            else:
                reported += 1

            # Priority breakdown
            pr = (issue.priority or "Medium").strip()
            if pr == "Critical":
                crit_count += 1
            elif pr == "High":
                high_count += 1
            elif pr == "Medium":
                med_count += 1
            elif pr == "Low":
                low_count += 1

            sla_target = PRIORITY_SLA_HOURS.get(pr, 120.0)
            created = issue.created_at
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)

            # Overdue check for unresolved issues
            if st != "Resolved":
                if created:
                    age_hours = (now - created).total_seconds() / 3600.0
                    if age_hours > sla_target:
                        overdue += 1
            else:
                # Resolution time computation
                res_time = issue.resolved_at or issue.updated_at or issue.created_at
                if res_time and res_time.tzinfo is None:
                    res_time = res_time.replace(tzinfo=timezone.utc)

                if created and res_time and res_time >= created:
                    duration_hours = (res_time - created).total_seconds() / 3600.0
                    resolution_times_hours.append(duration_hours)
                    if duration_hours <= sla_target:
                        resolved_within_sla_count += 1

        # Calculate averages & rates
        resolution_rate = round((resolved / total_assigned) * 100.0, 1) if total_assigned > 0 else 0.0
        avg_res_hours = round(sum(resolution_times_hours) / len(resolution_times_hours), 1) if resolution_times_hours else None
        within_sla_rate = round((resolved_within_sla_count / resolved) * 100.0, 1) if resolved > 0 else 0.0

        total_resolved_all += resolved
        total_overdue_all += overdue
        total_resolved_within_sla_all += resolved_within_sla_count
        total_resolved_with_sla_trackable += resolved

        dept_perf = DepartmentPerformance(
            department_name=dept_name,
            total_assigned=total_assigned,
            reported=reported,
            in_progress=in_progress,
            resolved=resolved,
            overdue=overdue,
            critical_count=crit_count,
            high_count=high_count,
            medium_count=med_count,
            low_count=low_count,
            avg_resolution_hours=avg_res_hours,
            resolution_rate=resolution_rate,
            within_sla_rate=within_sla_rate,
            performance_rank=1
        )
        dept_stats_list.append(dept_perf)

    # Sort departments to calculate performance ranking
    # Performance score: resolution_rate * 0.6 + within_sla_rate * 0.4 - (overdue * 5)
    def compute_score(d: DepartmentPerformance) -> float:
        if d.total_assigned == 0:
            return -1.0
        return (d.resolution_rate * 0.6) + (d.within_sla_rate * 0.4) - (d.overdue * 2.0)

    sorted_by_perf = sorted(dept_stats_list, key=compute_score, reverse=True)
    rankings: List[Dict[str, Any]] = []

    for rank_idx, d in enumerate(sorted_by_perf, start=1):
        d.performance_rank = rank_idx
        rankings.append({
            "rank": rank_idx,
            "department": d.department_name,
            "resolution_rate": d.resolution_rate,
            "within_sla_rate": d.within_sla_rate,
            "unresolved_backlog": d.reported + d.in_progress,
            "overdue": d.overdue,
            "total_assigned": d.total_assigned
        })

    # Overall municipal stats
    overall_res_rate = round((total_resolved_all / total_complaints) * 100.0, 1) if total_complaints > 0 else 0.0
    overall_sla_rate = round((total_resolved_within_sla_all / total_resolved_with_sla_trackable) * 100.0, 1) if total_resolved_with_sla_trackable > 0 else 0.0

    # Top performing and highest backlog departments
    active_depts = [d for d in dept_stats_list if d.total_assigned > 0]
    top_dept = sorted_by_perf[0].department_name if active_depts else None

    # Department with largest unresolved backlog (reported + in_progress)
    highest_backlog_dept = None
    if active_depts:
        backlog_sorted = sorted(active_depts, key=lambda d: d.reported + d.in_progress, reverse=True)
        if backlog_sorted and (backlog_sorted[0].reported + backlog_sorted[0].in_progress) > 0:
            highest_backlog_dept = backlog_sorted[0].department_name

    summary = MunicipalSummary(
        total_complaints=total_complaints,
        overall_resolution_rate=overall_res_rate,
        overall_sla_compliance_rate=overall_sla_rate,
        total_overdue=total_overdue_all,
        top_performing_department=top_dept,
        highest_backlog_department=highest_backlog_dept
    )

    # Generate concise, deterministic insights from actual stats
    insights = _generate_performance_insights(summary, dept_stats_list)

    return DepartmentAnalyticsResponse(
        summary=summary,
        departments=dept_stats_list,
        rankings=rankings,
        insights=insights
    )


def _generate_performance_insights(
    summary: MunicipalSummary,
    departments: List[DepartmentPerformance]
) -> List[str]:
    """
    Generate crisp, truthful performance insights strictly derived from actual SQLite stats.
    Never invents statistics or numbers.
    """
    insights: List[str] = []

    if summary.total_complaints == 0:
        return ["No civic complaints recorded in the selected period."]

    # 1. Backlog insight
    active_depts = [d for d in departments if d.total_assigned > 0]
    if active_depts:
        max_backlog = max(active_depts, key=lambda d: d.reported + d.in_progress)
        backlog_count = max_backlog.reported + max_backlog.in_progress
        if backlog_count > 0:
            insights.append(
                f"The {max_backlog.department_name} currently has the highest active workload with {backlog_count} unresolved complaints."
            )

    # 2. Resolution rate insight
    if active_depts:
        max_res = max(active_depts, key=lambda d: d.resolution_rate)
        if max_res.resolution_rate > 0:
            insights.append(
                f"{max_res.department_name} leads municipal resolution performance, having closed {max_res.resolution_rate}% of assigned issues."
            )

    # 3. Overdue & SLA insight
    overdue_depts = [d for d in departments if d.overdue > 0]
    if overdue_depts:
        most_overdue = max(overdue_depts, key=lambda d: d.overdue)
        insights.append(
            f"SLA Warning: {most_overdue.department_name} has {most_overdue.overdue} overdue complaints exceeding target resolution windows."
        )
    else:
        insights.append("All active municipal departments are operating within their target SLA thresholds with zero overdue escalations.")

    # 4. Critical issues alert
    crit_depts = [d for d in departments if d.critical_count > 0]
    total_crit = sum(d.critical_count for d in departments)
    if total_crit > 0:
        insights.append(
            f"Public Safety Priority: {total_crit} Critical priority complaints recorded city-wide requiring prioritized dispatch coordination."
        )

    # 5. Overall compliance
    if summary.overall_resolution_rate > 0:
        insights.append(
            f"City-wide resolution efficiency stands at {summary.overall_resolution_rate}% with an average SLA compliance rate of {summary.overall_sla_compliance_rate}%."
        )

    return insights[:5]


def calculate_complaint_trends(
    db: Session,
    days: int = 30
) -> AnalyticsTrendsResponse:
    """
    Compute daily complaint trends, priority distributions, and category breakdown.
    """
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    issues = db.query(Issue).filter(Issue.created_at >= start_date).all()

    # Aggregate by date
    daily_data: Dict[str, Dict[str, int]] = {}
    for i in range(days + 1):
        dt = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_data[dt] = {"received": 0, "resolved": 0, "in_progress": 0}

    priority_dist: Dict[str, int] = {p: 0 for p in PRIORITY_LEVELS}
    category_dist: Dict[str, int] = {c: 0 for c in ALLOWED_CATEGORIES}
    status_dist: Dict[str, int] = {"Reported": 0, "In Progress": 0, "Resolved": 0}

    for issue in issues:
        # Date key
        if issue.created_at:
            created_dt = issue.created_at
            if created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            date_key = created_dt.strftime("%Y-%m-%d")
            if date_key in daily_data:
                daily_data[date_key]["received"] += 1

        # Status tracking
        st = issue.status or "Reported"
        status_dist[st] = status_dist.get(st, 0) + 1

        if st == "In Progress" and issue.created_at:
            date_key = issue.created_at.strftime("%Y-%m-%d")
            if date_key in daily_data:
                daily_data[date_key]["in_progress"] += 1

        # Resolved date
        if st == "Resolved":
            res_date = issue.resolved_at or issue.updated_at
            if res_date:
                if res_date.tzinfo is None:
                    res_date = res_date.replace(tzinfo=timezone.utc)
                res_key = res_date.strftime("%Y-%m-%d")
                if res_key in daily_data:
                    daily_data[res_key]["resolved"] += 1

        # Priority
        pr = issue.priority or "Medium"
        priority_dist[pr] = priority_dist.get(pr, 0) + 1

        # Category
        cat = issue.citizen_category or "Other"
        category_dist[cat] = category_dist.get(cat, 0) + 1

    trend_points: List[TrendDataPoint] = [
        TrendDataPoint(
            date=dt,
            received=counts["received"],
            resolved=counts["resolved"],
            in_progress=counts["in_progress"]
        )
        for dt, counts in sorted(daily_data.items())
    ]

    return AnalyticsTrendsResponse(
        period=f"Last {days} days",
        trends=trend_points,
        priority_distribution=priority_dist,
        category_distribution=category_dist,
        status_distribution=status_dist
    )
