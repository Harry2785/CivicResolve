import io
import os
import uuid
import base64
import logging
from pathlib import Path
from typing import Tuple, Optional
import httpx
from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.core.constants import (
    MAX_IMAGE_SIZE_BYTES,
    ALLOWED_IMAGE_MIME_TYPES,
    ALLOWED_IMAGE_FORMATS
)
from app.core.config import settings

logger = logging.getLogger("civicresolve.storage")


def _upload_to_vercel_blob(image_bytes: bytes, filename: str, mime_type: str) -> Optional[str]:
    """
    Upload image to Vercel Blob persistent object storage if configured.
    Reads BLOB_READ_WRITE_TOKEN from environment.
    """
    token = os.getenv("BLOB_READ_WRITE_TOKEN")
    if not token:
        return None
    try:
        url = f"https://blob.vercel-storage.com/{filename}"
        headers = {
            "Authorization": f"Bearer {token}",
            "x-api-version": "7",
            "content-type": mime_type,
            "x-add-random-suffix": "1"
        }
        resp = httpx.put(url, content=image_bytes, headers=headers, timeout=10.0)
        if resp.status_code in (200, 201):
            data = resp.json()
            public_url = data.get("url")
            if public_url:
                logger.info(f"Image successfully uploaded to Vercel Blob storage: {public_url}")
                return public_url
        logger.warning(f"Vercel Blob upload returned status {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Failed to upload to Vercel Blob: {e}")
    return None


def validate_and_save_image(
    file: UploadFile,
    image_bytes: bytes,
    destination_dir: Path
) -> Tuple[str, str, bytes]:
    """
    Validate uploaded image for type, content, size, and security.

    Requirements:
    - JPEG, PNG, and WebP only
    - Maximum 5 MB
    - Validate file type and real image content (reject disguised executables)
    - Generate unique filenames
    - Never expose uploaded files as executable content

    Returns:
        (relative_image_path, normalized_mime_type, validated_bytes)
    """
    # 1. Size Validation (Max 5 MB)
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image file size exceeds the 5 MB limit (Received {len(image_bytes) / (1024 * 1024):.2f} MB)."
        )

    if len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image file is empty."
        )

    # 2. Extension & Content-Type Header Check
    filename = file.filename or "upload.jpg"
    ext = Path(filename).suffix.lower()

    valid_extensions = [ext for exts in ALLOWED_IMAGE_MIME_TYPES.values() for ext in exts]
    if ext not in valid_extensions:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Invalid file extension '{ext}'. Allowed extensions: JPEG (.jpg, .jpeg), PNG (.png), and WebP (.webp)."
        )

    # 3. Content-Type Header Verification
    declared_content_type = (file.content_type or "").lower()
    if declared_content_type not in ALLOWED_IMAGE_MIME_TYPES:
        # Fall back to extension mapping if client provided generic octet-stream
        matching_types = [
            mime for mime, exts in ALLOWED_IMAGE_MIME_TYPES.items() if ext in exts
        ]
        if not matching_types:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported image MIME type '{declared_content_type}'. Must be JPEG, PNG, or WebP."
            )
        declared_content_type = matching_types[0]

    # 4. Deep Content Validation via Pillow (verifies real image bytes, prevents disguised executables/scripts)
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img_format = (img.format or "").upper()
            if img_format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=f"Image content format '{img_format}' is not permitted. Only JPEG, PNG, and WebP are allowed."
                )
            # Verify file integrity
            img.verify()
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid or readable image. Disguised executables and scripts are strictly rejected."
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Corrupted or invalid image data: {str(e)}"
        )

    # Map verified format to standardized extension and MIME
    format_map = {
        "JPEG": (".jpg", "image/jpeg"),
        "PNG": (".png", "image/png"),
        "WEBP": (".webp", "image/webp")
    }
    safe_ext, safe_mime = format_map.get(img_format, (ext, declared_content_type))

    # 5. Unique, non-executable filename generation
    unique_filename = f"{uuid.uuid4().hex}{safe_ext}"

    # Safe local write (guarantees local copy is saved if directory is writable)
    try:
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination_path = destination_dir / unique_filename
        with open(destination_path, "wb") as f:
            f.write(image_bytes)
    except OSError:
        pass

    # 6. Persistent object storage resolution for serverless runtime
    # A. Vercel Blob Storage (if BLOB_READ_WRITE_TOKEN configured)
    blob_url = _upload_to_vercel_blob(image_bytes, unique_filename, safe_mime)
    if blob_url:
        return blob_url, safe_mime, image_bytes

    # B. On Vercel serverless functions without external object storage:
    # Use Data URI format so images persist permanently in PostgreSQL without ephemeral /tmp loss
    if settings.IS_VERCEL or os.getenv("USE_DATA_URL_STORAGE") == "1":
        b64_encoded = base64.b64encode(image_bytes).decode("utf-8")
        persistent_data_url = f"data:{safe_mime};base64,{b64_encoded}"
        return persistent_data_url, safe_mime, image_bytes

    # C. Default local development URL
    relative_url = f"/uploads/{unique_filename}"
    return relative_url, safe_mime, image_bytes
