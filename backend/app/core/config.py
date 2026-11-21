import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Search for .env in current directory, backend directory, or project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BASE_DIR.parent

# Load .env file if it exists
for env_path in [BASE_DIR / ".env", ROOT_DIR / ".env"]:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        break
else:
    load_dotenv()  # Fallback to default search


class Settings:
    PROJECT_NAME: str = "CivicResolve API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "AI-Powered Civic Issue Reporting and Resolution Platform"
    API_PREFIX: str = "/api"

    # Server settings
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # SQLite Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{BASE_DIR / 'civicresolve.db'}"
    )

    # Gemini AI Configuration
    # Defaults to gemini-2.5-flash as requested, with graceful fallback to gemini-3.8-flash
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    FALLBACK_GEMINI_MODEL: str = os.getenv("FALLBACK_GEMINI_MODEL", "gemini-3.8-flash")

    # Media & Uploads directory
    UPLOAD_DIR: Path = BASE_DIR / "uploads"

    # Administrator Authentication & Allowlist
    ADMIN_EMAILS_RAW: str = os.getenv(
        "ADMIN_EMAILS",
        "official1@example.gov.in,official2@example.gov.in,admin@civicresolve.gov.in,admin.test@gmail.com"
    )

    @property
    def admin_emails(self) -> List[str]:
        """Return normalized (lowercased and trimmed) list of authorized administrator emails."""
        return [
            email.strip().lower()
            for email in self.ADMIN_EMAILS_RAW.split(",")
            if email.strip()
        ]

    # Firebase Admin SDK Configuration
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")
    FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    # Allow mock tokens for automated tests / developer environment when configured
    ALLOW_TEST_AUTH: bool = os.getenv("ALLOW_TEST_AUTH", "true").lower() in ("true", "1", "yes")

    @property
    def firebase_project_id(self) -> str:
        """
        Resolve Firebase project ID from environment, or auto-detect from frontend/.env.local.
        """
        if self.FIREBASE_PROJECT_ID:
            return self.FIREBASE_PROJECT_ID.strip()
        
        env_pid = os.getenv("VITE_FIREBASE_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
        if env_pid:
            return env_pid.strip()

        # Check frontend .env.local or .env
        for f_path in [ROOT_DIR / "frontend" / ".env.local", ROOT_DIR / "frontend" / ".env"]:
            if f_path.exists():
                try:
                    with open(f_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip().startswith("VITE_FIREBASE_PROJECT_ID="):
                                return line.strip().split("=", 1)[1].strip()
                except Exception:
                    pass

        return "civicresolve-4f39e"

    # CORS configuration
    @property
    def cors_origins(self) -> List[str]:
        raw_origins = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
        )
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


settings = Settings()

# Ensure uploads directory exists
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
