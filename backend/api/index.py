import os
import sys

# Ensure backend root directory is in sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ["SERVERLESS"] = "1"

from app.main import app

# Export FastAPI app for Vercel's Python Serverless Runtime
__all__ = ["app"]
