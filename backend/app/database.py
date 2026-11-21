from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

# SQLite connection args
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
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
    """Check whether the SQLite database is reachable and queryable."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def migrate_db_schema() -> None:
    """
    Safely apply schema migrations to the SQLite database without dropping or overwriting records.
    Adds latitude, longitude, and resolved_at columns if not present.
    """
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(issues)"))
            existing_columns = {row[1] for row in res.fetchall()}

            if existing_columns:
                if "citizen_uid" not in existing_columns:
                    conn.execute(text("ALTER TABLE issues ADD COLUMN citizen_uid VARCHAR(128)"))
                if "latitude" not in existing_columns:
                    conn.execute(text("ALTER TABLE issues ADD COLUMN latitude FLOAT"))
                if "longitude" not in existing_columns:
                    conn.execute(text("ALTER TABLE issues ADD COLUMN longitude FLOAT"))
                if "resolved_at" not in existing_columns:
                    conn.execute(text("ALTER TABLE issues ADD COLUMN resolved_at DATETIME"))
                
                # Backfill resolved_at for historical resolved complaints
                conn.execute(text("UPDATE issues SET resolved_at = updated_at WHERE status = 'Resolved' AND resolved_at IS NULL"))
                conn.commit()
    except Exception as e:
        import logging
        logging.getLogger("civicresolve.db").warning(f"Database schema migration notice: {e}")


def init_db() -> None:
    """Initialize database tables, apply schema migrations, and seed sample complaints on first creation only."""
    Base.metadata.create_all(bind=engine)
    migrate_db_schema()
    try:
        from app.database_seed import seed_demo_complaints_if_empty
        db = SessionLocal()
        seed_demo_complaints_if_empty(db)
        db.close()
    except Exception as e:
        # Avoid crashing startup if seeding encounters an issue
        pass
