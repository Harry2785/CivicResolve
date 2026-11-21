import os
import sys

# Ensure backend directory is in sys.path so 'app' can be resolved
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from app.main import app

# Export FastAPI app for Vercel's Python Serverless Runtime
__all__ = ["app"]
