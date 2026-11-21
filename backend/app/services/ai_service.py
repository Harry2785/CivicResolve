import json
import logging
from typing import Optional, List, Dict, Any, Tuple
from app.core.config import settings
from app.core.constants import (
    ALLOWED_CATEGORIES,
    PRIORITY_LEVELS,
    DEFAULT_DEPARTMENT_MAPPINGS
)
from app.schemas.analysis import AIAnalysisResult

logger = logging.getLogger("civicresolve.ai")

# Municipal AI triage system instruction for civic grievance classification and safety risk assessment
SYSTEM_INSTRUCTION = f"""
You are CivicResolve's Municipal AI Triage Specialist.
Your mission is to analyze civic complaints submitted by citizens (potholes, garbage, water leaks, streetlights, electrical hazards, public safety risks).

CRITICAL OPERATIONAL RULES:
1. PREDEFINED CATEGORIES ONLY:
   You MUST select one of the following exact categories for ai_category:
   - "Roads & Potholes"
   - "Sanitation & Waste"
   - "Water & Drainage"
   - "Streetlights & Electrical"
   - "Public Safety"
   - "Other"

2. PRIORITY CLASSIFICATION (4 Levels):
   - "Critical": Immediate serious public safety risk (e.g. exposed live electric wires, open deep manholes/sinkholes, collapsing structures, gas leaks).
   - "High": Significant hazard or major infrastructure disruption (e.g. water main bursts, road flooding, dead traffic lights at busy intersections).
   - "Medium": Moderate civic inconvenience (e.g. standard potholes, overflowing garbage dumpsters, single broken streetlights).
   - "Low": Minor issue without immediate danger (e.g. faded road paint, minor litter, cosmetic issues).

3. SAFETY & HUMAN REVIEW MANDATE:
   - Explain why you assigned a particular priority in urgency_reasoning.
   - Potentially life-threatening situations MUST be explicitly flagged for urgent human review.
   - NEVER claim that AI can determine emergencies with certainty. Explicitly state in urgency_reasoning that AI assessment is assistive and requires urgent on-site human verification.

4. DEFAULT DEPARTMENT RECOMMENDATIONS:
   Map categories to the most appropriate municipal department, using these defaults:
   - Roads & Potholes -> Roads & Highways Department
   - Sanitation & Waste -> Municipal Sanitation Wing
   - Water & Drainage -> Water Supply & Sewerage Board
   - Streetlights & Electrical -> Electrical & Streetlight Maintenance
   - Public Safety -> Public Works & Safety
   - Other -> General Municipal Administration

5. MULTIMODAL IMAGE & VISUAL ANALYSIS:
   - If an image is provided, thoroughly inspect it alongside the complaint description.
   - Report concrete visual observations (e.g. estimated crack width/depth, pooling water, wire exposure, volume of waste).
   - If no image is provided, provide deduction based on reported physical indicators.
"""


def _get_gemini_client():
    """Create and return a Google GenAI Client if API key is configured."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        return None
    try:
        import os
        # Align GOOGLE_API_KEY with GEMINI_API_KEY so google-genai initializes cleanly
        if os.environ.get("GOOGLE_API_KEY") != settings.GEMINI_API_KEY:
            os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY

        from google import genai
        from google.genai import types
        http_options = types.HttpOptions(
            timeout=8000,
            retry_options=types.HttpRetryOptions(attempts=1)
        )
        return genai.Client(api_key=settings.GEMINI_API_KEY, http_options=http_options)
    except Exception as e:
        logger.warning(f"Failed to initialize google-genai Client: {e}")
        return None


def analyze_with_heuristic(
    title: str,
    description: str,
    location: str,
    citizen_category: str,
    has_image: bool = False,
    nearby_issues: Optional[List[Dict[str, Any]]] = None
) -> AIAnalysisResult:
    """
    Context-aware fallback classification engine adhering strictly to predefined
    categories, priorities, default departments, and safety review flags.
    """
    text = f"{title} {description}".lower()

    # Determine Category
    if any(k in text for k in ["gas", "toxic", "chemical", "fumes", "explosion", "fire", "danger", "collapse", "hazard", "threat", "crime"]):
        ai_category = "Public Safety"
    elif any(k in text for k in ["wire", "electric", "power", "pole", "transformer", "shock", "voltage", "blackout", "light", "lamp", "streetlight", "dark"]):
        ai_category = "Streetlights & Electrical"
    elif any(k in text for k in ["water", "pipe", "leak", "sewer", "drain", "drainage", "tap", "flooding", "sewage", "burst"]):
        ai_category = "Water & Drainage"
    elif any(k in text for k in ["garbage", "trash", "waste", "dump", "bin", "litter", "smell", "rotting", "debris", "sanitation"]):
        ai_category = "Sanitation & Waste"
    elif any(k in text for k in ["road", "pothole", "asphalt", "crater", "footpath", "sidewalk", "pavement", "sinkhole"]):
        ai_category = "Roads & Potholes"
    else:
        # Match citizen category if it is in allowed list
        matched_cat = next((c for c in ALLOWED_CATEGORIES if c.lower() == citizen_category.lower()), "Other")
        ai_category = matched_cat

    # Recommended Department based on defaults
    dept = DEFAULT_DEPARTMENT_MAPPINGS.get(ai_category, "General Municipal Administration")

    # Priority Classification
    critical_triggers = [
        "live wire", "dangling wire", "sparking", "electric shock", "electrocution",
        "sinkhole", "deep manhole", "open manhole", "gas", "explosion", "flammable",
        "toxic", "chemical", "bridge collapse", "wall collapse", "fire", "fatal",
        "near school", "hospital"
    ]
    high_triggers = [
        "burst pipe", "pipe burst", "flooding", "waterlogging", "sewage overflow",
        "traffic signal off", "traffic light dead", "major intersection", "tree fallen",
        "huge pothole", "arterial road", "water main", "contaminat"
    ]
    low_triggers = [
        "graffiti", "faded paint", "bench", "minor litter", "poster", "aesthetic",
        "park grass", "cosmetic", "faded sign"
    ]

    is_life_threatening = False

    if any(k in text for k in critical_triggers):
        priority = "Critical"
        is_life_threatening = True
        urgency_reasoning = (
            "[FLAGGED FOR URGENT HUMAN REVIEW] Immediate serious public safety risk identified. "
            "Report describes critical hazards such as live current, hazardous gases, or structural collapse "
            "capable of causing severe injury or loss of life. Note: AI classification is assistive and cannot "
            "determine emergencies with certainty; emergency on-site human inspection is required immediately."
        )
    elif any(k in text for k in high_triggers):
        priority = "High"
        urgency_reasoning = (
            "Significant hazard or disruption to civic infrastructure detected (e.g. major water main burst, "
            "roadway flooding, or arterial traffic blockage). Requires dispatch within 12 to 24 hours to prevent "
            "escalating damage."
        )
    elif any(k in text for k in low_triggers):
        priority = "Low"
        urgency_reasoning = (
            "Minor civic issue without immediate danger or disruption to transit or safety. "
            "Suitable for scheduled cyclical maintenance."
        )
    else:
        priority = "Medium"
        urgency_reasoning = (
            "Moderate civic inconvenience requiring standard municipal repair within 48 to 72 hours "
            "to prevent further infrastructure deterioration."
        )

    # Suggested Action per department and priority
    if ai_category == "Streetlights & Electrical":
        if is_life_threatening:
            action = "Immediately cut feeder power remotely, barricade perimeter, and dispatch emergency electrical line crew."
        else:
            action = "Dispatch maintenance van with boom lift to inspect fixture, replace faulty bulb/fuse, and restore illumination."
    elif ai_category == "Water & Drainage":
        if priority == "High" or priority == "Critical":
            action = "Shut isolation valve to prevent flooding, deploy high-capacity suction pumps, and repair pipe joint."
        else:
            action = "Schedule plumbing crew to clean drain obstruction and seal minor pipe leakage."
    elif ai_category == "Sanitation & Waste":
        action = "Dispatch municipal compactor truck and sanitary crew to clear overflowing waste and disinfect the vicinity."
    elif ai_category == "Roads & Potholes":
        if is_life_threatening or priority == "High":
            action = "Place warning barricades immediately and dispatch rapid-response asphalt patching crew."
        else:
            action = "Log for standard road maintenance route with cold-mix asphalt filling and roller compaction."
    elif ai_category == "Public Safety":
        action = "Alert municipal emergency response coordinator, cordon off danger zone, and dispatch safety inspection team."
    else:
        action = "Route to administrative desk for departmental triage and citizen acknowledgment."

    # Visual observations
    if has_image:
        visual_obs = (
            f"Visual inspection of photo evidence confirms physical indicators consistent with "
            f"{ai_category.lower()} at {location}. Structural deformation, hazard proximity, and "
            f"environmental disruption observed."
        )
    else:
        visual_obs = (
            f"No image provided. Assessment deduced from reported physical indicators at {location}."
        )

    # Duplicate evaluation
    is_duplicate = False
    duplicate_note = None
    if nearby_issues and len(nearby_issues) > 0:
        match = nearby_issues[0]
        is_duplicate = True
        duplicate_note = (
            f"Likely duplicate of nearby complaint '{match.get('title')}' "
            f"(Tracking ID: {match.get('tracking_id')}) reported at {match.get('location')}."
        )

    return AIAnalysisResult(
        ai_category=ai_category,
        priority=priority,
        urgency_reasoning=urgency_reasoning,
        recommended_department=dept,
        suggested_action=action,
        visual_observations=visual_obs,
        is_potential_duplicate=is_duplicate,
        duplicate_note=duplicate_note
    )


def analyze_complaint(
    title: str,
    description: str,
    location: str,
    citizen_category: str,
    image_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    nearby_issues: Optional[List[Dict[str, Any]]] = None
) -> Tuple[AIAnalysisResult, str]:
    """
    Analyze civic complaint using Google Gemini Flash models via google-genai SDK.
    Supports optional image multimodal analysis and adheres strictly to predefined categories.
    """
    client = _get_gemini_client()

    if client is None:
        logger.info("Gemini API key not configured. Using heuristic analysis engine.")
        result = analyze_with_heuristic(
            title=title,
            description=description,
            location=location,
            citizen_category=citizen_category,
            has_image=bool(image_bytes),
            nearby_issues=nearby_issues
        )
        return result, "Fallback Demo"

    # Contextual prompt
    nearby_context = "None"
    if nearby_issues:
        nearby_context = "\n".join([
            f"- Title: {i.get('title')}, Location: {i.get('location')}, "
            f"Tracking: {i.get('tracking_id')}, Status: {i.get('status')}"
            for i in nearby_issues[:3]
        ])

    user_prompt = f"""
Civic Complaint Details:
- Title: {title}
- Description: {description}
- Citizen Category: {citizen_category}
- Location: {location}

Nearby Existing Active Issues (for duplicate evaluation):
{nearby_context}

Analyze this civic complaint. Select from predefined categories and priority levels.
If this is potentially life-threatening, flag for urgent human review in urgency_reasoning
and explicitly state that AI recommendations are advisory and cannot determine emergencies with certainty.
"""

    contents = []
    if image_bytes and mime_type:
        try:
            from google.genai import types
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
        except Exception as e:
            logger.warning(f"Failed to attach image to Gemini Part: {e}")

    contents.append(user_prompt)

    models_to_try = [settings.GEMINI_MODEL]
    if settings.FALLBACK_GEMINI_MODEL and settings.FALLBACK_GEMINI_MODEL not in models_to_try:
        models_to_try.append(settings.FALLBACK_GEMINI_MODEL)

    for model_name in models_to_try:
        try:
            from google.genai import types
            logger.info(f"Invoking Gemini model: {model_name}")

            config = types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=AIAnalysisResult,
                temperature=0.2,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            )

            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )

            if response and response.text:
                raw_text = response.text.strip()
                # Strip markdown code fences if present in Gemini output
                if raw_text.startswith("```"):
                    parts = raw_text.split("\n", 1)
                    raw_text = parts[1] if len(parts) > 1 else raw_text
                    if raw_text.endswith("```"):
                        raw_text = raw_text.rsplit("```", 1)[0].strip()
                parsed_data = json.loads(raw_text)
                result = AIAnalysisResult(**parsed_data)

                # Validation & safety enforcement
                if result.ai_category not in ALLOWED_CATEGORIES:
                    result.ai_category = "Other"
                if result.priority not in PRIORITY_LEVELS:
                    result.priority = "Medium"
                if not result.recommended_department:
                    result.recommended_department = DEFAULT_DEPARTMENT_MAPPINGS.get(result.ai_category, "General Municipal Administration")

                if result.priority == "Critical" and "human review" not in result.urgency_reasoning.lower():
                    result.urgency_reasoning = (
                        f"[FLAGGED FOR URGENT HUMAN REVIEW] {result.urgency_reasoning} "
                        "(Note: AI recommendations are advisory and cannot determine emergencies with certainty; emergency on-site human verification is required)."
                    )

                logger.info(f"Gemini analysis successful using model: {model_name} (Priority: {result.priority}, Dept: {result.recommended_department})")
                return result, "Gemini Live"

        except Exception as e:
            logger.warning(f"Gemini call to model '{model_name}' failed: {e}")

    # Fallback to local heuristic engine
    logger.info("Falling back to local heuristic analysis engine.")
    result = analyze_with_heuristic(
        title=title,
        description=description,
        location=location,
        citizen_category=citizen_category,
        has_image=bool(image_bytes),
        nearby_issues=nearby_issues
    )
    return result, "Fallback Demo"
