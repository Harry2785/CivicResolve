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


def is_vercel_environment() -> bool:
    """Detect if running inside Vercel's serverless runtime environment."""
    return bool(
        os.getenv("VERCEL") == "1"
        or os.getenv("VERCEL_ENV")
        or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
        or str(Path(__file__).resolve()).startswith("/var/task")
    )


class Settings:
    PROJECT_NAME: str = "CivicResolve API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "AI-Powered Civic Issue Reporting and Resolution Platform"
    API_PREFIX: str = "/api"

    # Server settings (binds to 0.0.0.0 in cloud/container environments like Render or in production)
    HOST: str = os.getenv(
        "HOST",
        "0.0.0.0" if (os.getenv("RENDER") or os.getenv("PORT") or os.getenv("ENVIRONMENT") == "production") else "127.0.0.1"
    )
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    @property
    def IS_VERCEL(self) -> bool:
        return is_vercel_environment()

    # Upload Directory Configuration:
    # 1. Configurable via environment variable (UPLOAD_DIR)
    # 2. On Vercel: Writable temporary directory /tmp/civicresolve/uploads
    # 3. Outside Vercel: Preserves existing local uploads directory (BASE_DIR / 'uploads')
    @property
    def UPLOAD_DIR(self) -> Path:
        env_upload = os.getenv("UPLOAD_DIR")
        if env_upload:
            return Path(env_upload)
        if self.IS_VERCEL:
            return Path("/tmp/civicresolve/uploads")
        return BASE_DIR / "uploads"

    # SQLite Database settings (auto-routes to /tmp/civicresolve/civicresolve.db when executing inside Vercel)
    @property
    def DATABASE_URL(self) -> str:
        env_url = os.getenv("DATABASE_URL")
        if self.IS_VERCEL:
            # If user explicitly configured an external database (e.g. PostgreSQL/MySQL) on Vercel, respect it
            if env_url and not env_url.startswith("sqlite:///.") and "/var/task" not in env_url and "civicresolve.db" not in env_url:
                return env_url
            tmp_dir = Path("/tmp/civicresolve")
            try:
                tmp_dir.mkdir(parents=True, exist_ok=True)
            except OSError:
                pass
            tmp_db = tmp_dir / "civicresolve.db"
            source_db = BASE_DIR / "civicresolve.db"
            if not tmp_db.exists() and source_db.exists():
                import shutil
                try:
                    shutil.copy2(source_db, tmp_db)
                except Exception:
                    pass
            return f"sqlite:///{tmp_db.as_posix()}"
        if env_url:
            return env_url
        return f"sqlite:///{(BASE_DIR / 'civicresolve.db').as_posix()}"

    # Gemini AI Configuration
    # Defaults to gemini-2.5-flash as requested, with graceful fallback to gemini-3.8-flash
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    FALLBACK_GEMINI_MODEL: str = os.getenv("FALLBACK_GEMINI_MODEL", "gemini-3.8-flash")

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
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,https://civicresolve-sqkf.onrender.com"
        )
        origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        if "https://civicresolve-sqkf.onrender.com" not in origins:
            origins.append("https://civicresolve-sqkf.onrender.com")
        return origins


settings = Settings()

# Ensure uploads directory exists safely without attempting to write inside read-only /var/task
# Ensure uploads directory exists
try:
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass
