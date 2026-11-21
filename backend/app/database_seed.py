import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.issue import Issue, generate_tracking_id

logger = logging.getLogger("civicresolve.db")

DEMO_COMPLAINTS = [
    {
        "title": "Severe road crater causing vehicle axle damage",
        "description": "Deep asphalt pothole approximately 3 feet across and 7 inches deep in the right lane. Multiple vehicles have suffered blown tires and motorcyclists risk severe falls.",
        "location": "Sector 18, Main Market Road, opposite Central Bank",
        "citizen_category": "Roads & Potholes",
        "ai_category": "Roads & Potholes",
        "priority": "Medium",
        "urgency_reasoning": "Moderate civic inconvenience posing safety risks to two-wheelers and vehicle suspension damage. Requires patching within 48 to 72 hours.",
        "recommended_department": "Roads & Highways Department",
        "suggested_action": "Deploy rapid road repair van with cold-mix bitumen compound and place hazard marker cones.",
        "visual_observations": "Asphalt fatigue cracking with deep aggregate loss visible on heavily trafficked lane.",
        "is_potential_duplicate": False,
        "status": "Reported",
        "admin_notes": None,
        "ai_mode": "Fallback Demo",
        "offset_hours": 12,
        "latitude": 12.9716,
        "longitude": 77.5946
    },
    {
        "title": "Dangling high-voltage power line sparking over flooded sidewalk",
        "description": "Storm severed an overhead power cable which is now suspended 4 feet above the sidewalk, discharging visible sparks into rain puddles near primary school gate.",
        "location": "Cross Road 4, near Little Angels Nursery School",
        "citizen_category": "Streetlights & Electrical",
        "ai_category": "Streetlights & Electrical",
        "priority": "Critical",
        "urgency_reasoning": "[FLAGGED FOR URGENT HUMAN REVIEW] Immediate serious public safety risk identified. Exposed live electrical current in standing water near school poses fatal electrocution hazard. Note: AI classification is assistive and cannot determine emergencies with certainty; emergency on-site human inspection is required immediately.",
        "recommended_department": "Electrical & Streetlight Maintenance",
        "suggested_action": "Remotely isolate feeder breaker sub-station 4B, deploy police tape barrier, and dispatch emergency high-voltage repair crew.",
        "visual_observations": "Severed copper conductor sparking intermittently in contact with pooled storm runoff.",
        "is_potential_duplicate": False,
        "status": "In Progress",
        "admin_notes": "Feeder line isolated remotely at 08:30. Field technician unit dispatched.",
        "ai_mode": "Gemini Live",
        "offset_hours": 8,
        "latitude": 12.9725,
        "longitude": 77.5952
    },
    {
        "title": "High-pressure potable water distribution line burst",
        "description": "Drinking water main line fractured under pavement, creating an 8-foot geyser and flooding commercial basements. Street is impassable due to 10 inches of standing water.",
        "location": "Outer Ring Road Underpass, Phase 2, Near Tech Park",
        "citizen_category": "Water & Drainage",
        "ai_category": "Water & Drainage",
        "priority": "High",
        "urgency_reasoning": "Significant infrastructure disruption. Massive treated drinking water loss coupled with localized roadway inundation. Response required within 12 to 24 hours.",
        "recommended_department": "Water Supply & Sewerage Board",
        "suggested_action": "Close gate valves 14 & 15 on main feeder line, deploy high-volume dewatering pumps, and excavate to weld pipe sleeve.",
        "visual_observations": "High-pressure water geyser erupting through fractured tarmac; pavement subsiding around rupture zone.",
        "is_potential_duplicate": False,
        "status": "In Progress",
        "admin_notes": "Gate valves closed. Dewatering pumps operational on site.",
        "ai_mode": "Gemini Live",
        "offset_hours": 18,
        "latitude": 12.9730,
        "longitude": 77.5960
    },
    {
        "title": "Overflowing municipal dumpster attracting pests near restaurant row",
        "description": "Three large green dumpsters are overflowing with decomposing organic waste for the past four days. Trash has spilled across 20 feet of the pedestrian walkway, emitting noxious odor.",
        "location": "Civic Centre Food Plaza, Block B, 8th Avenue",
        "citizen_category": "Sanitation & Waste",
        "ai_category": "Sanitation & Waste",
        "priority": "Medium",
        "urgency_reasoning": "Moderate civic health concern. Decomposing organic matter attracts stray animals and vectors near food establishments. Requires clearing within 24 to 48 hours.",
        "recommended_department": "Municipal Sanitation Wing",
        "suggested_action": "Dispatch mechanical compactor truck and sanitation team to empty containers and power-wash perimeter with disinfectant.",
        "visual_observations": "Dumpsters at 150% capacity with food packaging and organic waste scattered across paving stones.",
        "is_potential_duplicate": False,
        "status": "Resolved",
        "admin_notes": "Compactor truck #12 cleared site and disinfected area at 06:00.",
        "ai_mode": "Fallback Demo",
        "offset_hours": 36,
        "latitude": 12.9719,
        "longitude": 77.5948
    },
    {
        "title": "Missing storm drain manhole cover on unlit crossroad",
        "description": "Heavy cast iron manhole cover was dislodged or stolen, leaving an unprotected 6-foot deep drop in the middle of the road. There is zero lighting on this street at night.",
        "location": "Station Road, near West Gate Pedestrian Crossing",
        "citizen_category": "Public Safety",
        "ai_category": "Public Safety",
        "priority": "Critical",
        "urgency_reasoning": "[FLAGGED FOR URGENT HUMAN REVIEW] Immediate serious public safety risk identified. Open deep pit in vehicular/pedestrian path on unlit road can cause fatal head-on accidents or pedestrian falls. Note: AI classification is assistive and cannot determine emergencies with certainty; emergency on-site human inspection is required immediately.",
        "recommended_department": "Public Works & Safety",
        "suggested_action": "Erect illuminated reflective warning barricades around open shaft immediately and install replacement locking iron grate cover.",
        "visual_observations": "Open 24-inch circular aperture directly in traffic lane without perimeter guardrails.",
        "is_potential_duplicate": False,
        "status": "Reported",
        "admin_notes": None,
        "ai_mode": "Gemini Live",
        "offset_hours": 4,
        "latitude": 12.9721,
        "longitude": 77.5942
    },
    {
        "title": "Faded zebra crossing and damaged pedestrian park bench",
        "description": "Pedestrian crosswalk markings outside public park have faded due to weathering, and one wooden park bench has broken slats.",
        "location": "Green Valley Public Garden, Sector 7 North Gate",
        "citizen_category": "Other",
        "ai_category": "Other",
        "priority": "Low",
        "urgency_reasoning": "Minor issue without immediate danger. Non-critical public amenity refurbishment suitable for standard scheduled cyclical maintenance.",
        "recommended_department": "General Municipal Administration",
        "suggested_action": "Schedule thermoplastic line-repainting crew and forward carpentry request for bench timber restoration.",
        "visual_observations": "Faded reflective paint on roadway surface; cosmetic wooden slat detachment on municipal bench.",
        "is_potential_duplicate": False,
        "status": "Resolved",
        "admin_notes": "Thermoplastic striping applied; bench repaired by Parks division.",
        "ai_mode": "Fallback Demo",
        "offset_hours": 72,
        "latitude": 12.9850,
        "longitude": 77.6050
    }
]


def seed_demo_complaints_if_empty(db: Session) -> int:
    """
    Seed realistic sample civic complaints ONLY when database has zero records.
    Never overwrites existing records on restart.
    """
    try:
        existing_count = db.query(Issue).count()
        if existing_count > 0:
            logger.info(f"Database already contains {existing_count} issues. Skipping demo seeding.")
            return 0

        logger.info("Initializing database with realistic demo complaints across categories and priorities...")
        now = datetime.now(timezone.utc)

        for item in DEMO_COMPLAINTS:
            created_timestamp = now - timedelta(hours=item["offset_hours"])
            updated_timestamp = created_timestamp if item["status"] == "Reported" else now - timedelta(hours=item["offset_hours"] // 2)

            issue = Issue(
                tracking_id=generate_tracking_id(),
                title=item["title"],
                description=item["description"],
                location=item["location"],
                citizen_category=item["citizen_category"],
                ai_category=item["ai_category"],
                priority=item["priority"],
                urgency_reasoning=item["urgency_reasoning"],
                recommended_department=item["recommended_department"],
                suggested_action=item["suggested_action"],
                visual_observations=item["visual_observations"],
                is_potential_duplicate=item["is_potential_duplicate"],
                status=item["status"],
                admin_notes=item["admin_notes"],
                ai_mode=item["ai_mode"],
                latitude=item.get("latitude"),
                longitude=item.get("longitude"),
                created_at=created_timestamp,
                updated_at=updated_timestamp,
                resolved_at=updated_timestamp if item["status"] == "Resolved" else None
            )
            db.add(issue)

        db.commit()
        logger.info(f"Successfully seeded {len(DEMO_COMPLAINTS)} demo complaints.")
        return len(DEMO_COMPLAINTS)
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding demo data: {e}")
        return 0
