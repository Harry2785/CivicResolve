import os
import sys
from pathlib import Path

# Add project root and backend directory to sys.path so 'app' and other modules resolve cleanly
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

for p in [str(BACKEND_DIR), str(ROOT_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

# Mark serverless environment
os.environ["SERVERLESS"] = "1"

# Import existing FastAPI application
from app.main import app

# Export FastAPI app for Vercel ASGI serverless runtime
__all__ = ["app"]
