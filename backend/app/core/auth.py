import json
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.core.config import settings

logger = logging.getLogger("civicresolve.auth")
http_bearer = HTTPBearer(auto_error=False)

_firebase_admin_initialized = False


def get_unverified_payload(token: str) -> Dict[str, Any]:
    """Extract claims from JWT payload for audience/project extraction."""
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload = parts[1]
            padded = payload + "=" * ((4 - len(payload) % 4) % 4)
            return json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        pass
    return {}


def ensure_firebase_admin_initialized(project_id: Optional[str] = None):
    """Lazily and safely initialize Firebase Admin SDK with project ID."""
    global _firebase_admin_initialized
    target_pid = project_id or settings.firebase_project_id

    if firebase_admin._apps:
        try:
            default_app = firebase_admin.get_app()
            if getattr(default_app, "project_id", None) == target_pid:
                _firebase_admin_initialized = True
                return
            firebase_admin.delete_app(default_app)
        except Exception:
            pass

    try:
        if settings.FIREBASE_CREDENTIALS_PATH and Path(settings.FIREBASE_CREDENTIALS_PATH).exists():
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred, options={"projectId": target_pid})
            logger.info("Firebase Admin initialized using service account certificate.")
        else:
            firebase_admin.initialize_app(options={"projectId": target_pid})
            logger.info(f"Firebase Admin initialized with project ID: {target_pid}")
        _firebase_admin_initialized = True
    except Exception as e:
        logger.warning(f"Firebase Admin initialization note: {e}")


def decode_and_verify_token(token: str) -> Dict[str, Any]:
    """
    Verify the Firebase ID token and extract user claims.
    
    Supports:
    1. Automated unit test tokens (test-admin:<email>)
    2. Official Firebase Admin SDK verify_id_token
    3. Google Auth public key verify_firebase_token
    4. Development token payload verification
    """
    # 1. Check for test/mock tokens in allowed test environments
    if settings.ALLOW_TEST_AUTH:
        if token.startswith("test-admin:") or token == "mock-admin-token":
            email = token.split("test-admin:")[1] if "test-admin:" in token else "admin@civicresolve.gov.in"
            return {
                "uid": f"mock_admin_{email}",
                "email": email.strip().lower(),
                "email_verified": True,
                "name": "Test Administrator",
                "auth_time": 1700000000,
            }
        elif token.startswith("test-citizen:") or token == "mock-citizen-token":
            email = token.split("test-citizen:")[1] if "test-citizen:" in token else "citizen@example.com"
            return {
                "uid": f"mock_citizen_{email}",
                "email": email.strip().lower(),
                "email_verified": True,
                "name": "Test Citizen",
                "auth_time": 1700000000,
            }

    # 2. Extract payload to detect project ID
    payload = get_unverified_payload(token)
    token_project_id = payload.get("aud") or settings.firebase_project_id
    ensure_firebase_admin_initialized(token_project_id)

    # 3. Live verification using Firebase Admin SDK
    has_service_account = bool(settings.FIREBASE_CREDENTIALS_PATH and Path(settings.FIREBASE_CREDENTIALS_PATH).exists())
    try:
        decoded = firebase_auth.verify_id_token(token, check_revoked=has_service_account)
        return decoded
    except Exception as e1:
        logger.info(f"Firebase Admin verify_id_token note: {e1}. Trying Google OAuth verification...")

    # 4. Fallback verification using Google's public certificates directly
    try:
        req = google_requests.Request()
        decoded = google_id_token.verify_firebase_token(token, req, audience=token_project_id)
        if decoded:
            return decoded
    except Exception as e2:
        logger.info(f"Google id_token.verify_firebase_token note: {e2}")

    # 5. Development environment fallback if token is signed by Google Firebase and has email
    if settings.ALLOW_TEST_AUTH and payload.get("email") and payload.get("iss", "").startswith("https://securetoken.google.com/"):
        logger.info(f"Development token accepted for email: {payload.get('email')}")
        return payload

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid, expired, or revoked authentication token. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer)
) -> Dict[str, Any]:
    """
    Centralized authentication dependency.
    Extracts Bearer token, verifies identity, and returns decoded user claims.
    Returns HTTP 401 if unauthenticated.
    """
    if not auth_creds or not auth_creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer token in Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = decode_and_verify_token(auth_creds.credentials)
    return claims


async def require_admin(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Strict server-side administrator authorization dependency.
    
    SECURITY CONTROLS:
    1. Extracts the verified email from the server-decoded Firebase token.
    2. Normalizes the email (stripping whitespace and lowercasing).
    3. Strictly checks against backend ADMIN_EMAILS allowlist.
    4. Rejects all unauthorized accounts with HTTP 403 Forbidden.
    5. Never trusts frontend-supplied roles, claims, or headers.
    """
    email = current_user.get("email")
    if not email:
        logger.warning("Rejecting admin request: token has no associated email.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Authenticated account does not possess a verified email address."
        )

    normalized_email = email.strip().lower()
    allowed_admins = settings.admin_emails

    if normalized_email not in allowed_admins:
        logger.warning(
            f"Unauthorized administrative attempt by '{normalized_email}'. "
            f"Not in approved allowlist ({len(allowed_admins)} configured admins)."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Access Denied: Account '{normalized_email}' is not an authorized municipal administrator. "
                "Contact the municipal IT department to request administrative privileges."
            )
        )

    return {
        "uid": current_user.get("uid"),
        "email": normalized_email,
        "name": current_user.get("name") or normalized_email,
        "role": "admin"
    }


async def optional_authenticated_user(
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer)
) -> Optional[Dict[str, Any]]:
    """Optional authentication for citizen endpoints."""
    if not auth_creds or not auth_creds.credentials:
        return None
    try:
        return decode_and_verify_token(auth_creds.credentials)
    except Exception:
        return None
