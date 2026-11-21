import os
from pathlib import Path


# Tests explicitly opt into mock tokens; production defaults remain secure.
os.environ["ALLOW_TEST_AUTH"] = "true"
os.environ["ENVIRONMENT"] = "test"
os.environ["GEMINI_API_KEY"] = ""
os.environ["BLOB_READ_WRITE_TOKEN"] = ""
os.environ["FIREBASE_PROJECT_ID"] = "civicresolve-test"
os.environ["ADMIN_EMAILS"] = (
    "official1@example.gov.in,admin@civicresolve.gov.in,shrihari0877@gmail.com"
)
os.environ["DATABASE_URL"] = f"sqlite:///{(Path(__file__).parent / 'test-civicresolve.db').as_posix()}"
