from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

import os
import logging
from typing import Generator
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.pool import NullPool
from app.core.config import settings

logger = logging.getLogger("civicresolve.db")

db_url = settings.DATABASE_URL
is_sqlite = db_url.startswith("sqlite")
is_postgres = "postgres" in db_url.lower()

# Configure engine with serverless-safe connection pooling
if is_postgres:
    # On Vercel serverless functions, NullPool prevents idle connection accumulation on Neon
    if settings.IS_VERCEL or os.getenv("SERVERLESS") == "1":
        engine = create_engine(
            db_url,
            poolclass=NullPool,
            pool_pre_ping=True
        )
    else:
        engine = create_engine(
            db_url,
            pool_size=5,
            max_overflow=10,
            pool_recycle=300,
            pool_pre_ping=True
        )
else:
    # SQLite connection configuration
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields a database session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_health() -> bool:
    """Check whether the database (Neon PostgreSQL or SQLite) is reachable and queryable."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        return False


def migrate_db_schema() -> None:
    """
    Safely apply schema migrations to SQLite or PostgreSQL without dropping or overwriting records.
    Uses SQLAlchemy inspector for dialect-agnostic column verification.
    """
    try:
        inspector = inspect(engine)
        if not inspector.has_table("issues"):
            return

        existing_columns = {col["name"] for col in inspector.get_columns("issues")}

        if existing_columns:
            with engine.begin() as conn:
                if "citizen_uid" not in existing_columns:
                    conn.execute(text("ALTER TABLE issues ADD COLUMN citizen_uid VARCHAR(128)"))
                if "latitude" not in existing_columns:
                    type_str = "DOUBLE PRECISION" if is_postgres else "FLOAT"
                    conn.execute(text(f"ALTER TABLE issues ADD COLUMN latitude {type_str}"))
                if "longitude" not in existing_columns:
                    type_str = "DOUBLE PRECISION" if is_postgres else "FLOAT"
                    conn.execute(text(f"ALTER TABLE issues ADD COLUMN longitude {type_str}"))
                if "resolved_at" not in existing_columns:
                    type_str = "TIMESTAMP WITH TIME ZONE" if is_postgres else "DATETIME"
                    conn.execute(text(f"ALTER TABLE issues ADD COLUMN resolved_at {type_str}"))

                # Backfill resolved_at for historical resolved complaints
                conn.execute(text(
                    "UPDATE issues SET resolved_at = updated_at WHERE status = 'Resolved' AND resolved_at IS NULL"
                ))
    except Exception as e:
        logger.warning(f"Database schema migration notice: {e}")


_db_initialized = False

def init_db() -> None:
    """
    Initialize database tables, apply schema migrations, and seed sample complaints on first creation only.
    Safe for repeated serverless invocations.
    """
    global _db_initialized
    if _db_initialized and (settings.IS_VERCEL or os.getenv("SERVERLESS") == "1"):
        return

    try:
        Base.metadata.create_all(bind=engine)
        migrate_db_schema()
        _db_initialized = True
    except Exception as e:
        logger.warning(f"Database table initialization notice: {e}")

    try:
        from app.database_seed import seed_demo_complaints_if_empty
        db = SessionLocal()
        seed_demo_complaints_if_empty(db)
        db.close()
    except Exception:
        # Avoid crashing startup if seeding encounters an issue
        pass
