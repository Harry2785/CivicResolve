import os
import sys
from pathlib import Path

# Ensure backend root directory is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    # Render and cloud environments set PORT and require binding to 0.0.0.0
    port = int(os.getenv("PORT", str(settings.PORT)))
    is_cloud_or_prod = bool(
        os.getenv("RENDER")
        or os.getenv("PORT")
        or settings.ENVIRONMENT.lower() in ("production", "prod")
    )
    host = os.getenv("HOST", "0.0.0.0" if is_cloud_or_prod else settings.HOST)

    # Disable reload in production and cloud containers to prevent premature container shutdown on Render
    reload_enabled = False if is_cloud_or_prod else (settings.ENVIRONMENT == "development")

    print(f"Starting CivicResolve API on {host}:{port} (reload={reload_enabled}, env={settings.ENVIRONMENT})")
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload_enabled
    )
