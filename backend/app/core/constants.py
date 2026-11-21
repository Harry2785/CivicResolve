from typing import Dict, List

# Predefined Civic Categories (Required)
ALLOWED_CATEGORIES: List[str] = [
    "Roads & Potholes",
    "Sanitation & Waste",
    "Water & Drainage",
    "Streetlights & Electrical",
    "Public Safety",
    "Other"
]

# Priority Classification
PRIORITY_LEVELS: List[str] = [
    "Critical",
    "High",
    "Medium",
    "Low"
]

PRIORITY_DESCRIPTIONS: Dict[str, str] = {
    "Critical": "Immediate serious public safety risk. Requires urgent on-site human review.",
    "High": "Significant hazard or disruption to public infrastructure.",
    "Medium": "Moderate civic inconvenience.",
    "Low": "Minor issue without immediate danger."
}

# Default Department Mappings
DEFAULT_DEPARTMENT_MAPPINGS: Dict[str, str] = {
    "Roads & Potholes": "Roads & Highways Department",
    "Sanitation & Waste": "Municipal Sanitation Wing",
    "Water & Drainage": "Water Supply & Sewerage Board",
    "Streetlights & Electrical": "Electrical & Streetlight Maintenance",
    "Public Safety": "Public Works & Safety",
    "Other": "General Municipal Administration"
}

# Image Validation Specifications
MAX_IMAGE_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB maximum
ALLOWED_IMAGE_MIME_TYPES: Dict[str, List[str]] = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"]
}
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
