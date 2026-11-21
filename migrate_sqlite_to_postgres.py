"""
CivicResolve — SQLite to Neon PostgreSQL Data Migration Tool

Migrates existing complaint records from the local SQLite database (civicresolve.db)
into a production Neon PostgreSQL database without data loss or duplicates.

Usage:
    python migrate_sqlite_to_postgres.py
    python migrate_sqlite_to_postgres.py --target-url "postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require"
    python migrate_sqlite_to_postgres.py --sqlite-path ./backend/civicresolve.db
"""

import os
import sys
import argparse
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"

for p in [str(BACKEND_DIR), str(BASE_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.issue import Issue, Base
from app.core.config import settings


def migrate_sqlite_to_postgres(sqlite_path: str = None, target_url: str = None) -> bool:
    # 1. Resolve SQLite database path
    if not sqlite_path:
        candidates = [
            BACKEND_DIR / "civicresolve.db",
            BASE_DIR / "civicresolve.db",
            Path("civicresolve.db")
        ]
        for c in candidates:
            if c.exists():
                sqlite_path = str(c)
                break
        if not sqlite_path:
            sqlite_path = str(BACKEND_DIR / "civicresolve.db")

    if not Path(sqlite_path).exists():
        print(f"[!] Warning: SQLite database file not found at '{sqlite_path}'.")
        print("    If this is a fresh setup, initialize schema directly with init_db().")
        return False

    print(f"[*] Source SQLite database: {sqlite_path}")

    # 2. Resolve target PostgreSQL / Neon connection URL
    if not target_url:
        target_url = os.getenv("DATABASE_URL")

    if not target_url or not ("postgres" in target_url.lower()):
        print("[!] Error: No valid PostgreSQL target DATABASE_URL provided.")
        print("    Set DATABASE_URL environment variable or pass --target-url.")
        print("    Format: postgresql://[user]:[password]@[neon-host]/[dbname]?sslmode=require")
        return False

    # Normalize postgres:// to postgresql://
    if target_url.startswith("postgres://"):
        target_url = "postgresql://" + target_url[len("postgres://"):]

    masked_url = target_url.split("@")[-1] if "@" in target_url else "Neon PostgreSQL"
    print(f"[*] Target Database: ...@{masked_url}")

    # 3. Connect to SQLite
    sqlite_url = f"sqlite:///{Path(sqlite_path).resolve().as_posix()}"
    sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    SqliteSession = sessionmaker(bind=sqlite_engine)
    sqlite_db = SqliteSession()

    # 4. Connect to Neon PostgreSQL
    try:
        neon_engine = create_engine(target_url, pool_pre_ping=True)
        # Verify connection
        with neon_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[+] Successfully connected to Neon PostgreSQL.")
    except Exception as e:
        print(f"[!] Failed to connect to Neon PostgreSQL: {e}")
        return False

    # 5. Ensure tables exist in Neon PostgreSQL
    print("[*] Creating database tables and indexes in Neon PostgreSQL if not present...")
    Base.metadata.create_all(bind=neon_engine)

    NeonSession = sessionmaker(bind=neon_engine)
    neon_db = NeonSession()

    # 6. Read SQLite records
    try:
        sqlite_issues = sqlite_db.query(Issue).order_by(Issue.id.asc()).all()
        total_source = len(sqlite_issues)
        print(f"[*] Found {total_source} existing complaints in SQLite.")
    except Exception as e:
        print(f"[!] Error querying SQLite records: {e}")
        sqlite_db.close()
        return False

    if total_source == 0:
        print("[*] SQLite database is empty. No complaints to migrate.")
        sqlite_db.close()
        neon_db.close()
        return True

    # 7. Migrate records safely without duplicates
    migrated_count = 0
    skipped_count = 0

    for item in sqlite_issues:
        existing = neon_db.query(Issue).filter(Issue.tracking_id == item.tracking_id).first()
        if existing:
            skipped_count += 1
            continue

        new_issue = Issue(
            tracking_id=item.tracking_id,
            citizen_uid=item.citizen_uid,
            title=item.title,
            description=item.description,
            location=item.location,
            latitude=item.latitude,
            longitude=item.longitude,
            citizen_category=item.citizen_category,
            image_path=item.image_path,
            ai_category=item.ai_category,
            priority=item.priority,
            urgency_reasoning=item.urgency_reasoning,
            recommended_department=item.recommended_department,
            suggested_action=item.suggested_action,
            visual_observations=item.visual_observations,
            is_potential_duplicate=item.is_potential_duplicate,
            duplicate_note=item.duplicate_note,
            status=item.status,
            admin_notes=item.admin_notes,
            ai_mode=item.ai_mode,
            created_at=item.created_at,
            updated_at=item.updated_at,
            resolved_at=item.resolved_at
        )
        neon_db.add(new_issue)
        migrated_count += 1

    try:
        neon_db.commit()
        print(f"[+] Successfully migrated {migrated_count} complaints to Neon PostgreSQL.")
        if skipped_count > 0:
            print(f"[*] Skipped {skipped_count} complaints that were already present in target.")
    except Exception as e:
        neon_db.rollback()
        print(f"[!] Migration transaction error: {e}")
        sqlite_db.close()
        neon_db.close()
        return False

    # 8. Synchronize PostgreSQL auto-increment sequence
    try:
        with neon_engine.begin() as conn:
            conn.execute(text(
                "SELECT setval(pg_get_serial_sequence('issues', 'id'), COALESCE(max(id), 1)) FROM issues;"
            ))
        print("[+] Synchronized PostgreSQL primary key sequence (issues_id_seq).")
    except Exception as e:
        print(f"[!] Note on sequence sync: {e}")

    sqlite_db.close()
    neon_db.close()
    print("\n[OK] Migration completed successfully!")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate CivicResolve SQLite data to Neon PostgreSQL")
    parser.add_argument("--sqlite-path", help="Path to source civicresolve.db", default=None)
    parser.add_argument("--target-url", help="Target Neon PostgreSQL connection URL", default=None)
    args = parser.parse_args()

    success = migrate_sqlite_to_postgres(sqlite_path=args.sqlite_path, target_url=args.target_url)
    sys.exit(0 if success else 1)
