import logging
import os
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


settings = get_settings()

# Default engine configuration
def _create_engine(url: str):
    connect_args = {}
    if "asyncpg" in url:
        connect_args["timeout"] = 5
    elif "sqlite" in url:
        connect_args["check_same_thread"] = False

    is_dev = settings.environment == "development"
    if "sqlite" in url:
        return create_async_engine(
            url,
            echo=is_dev,
            connect_args=connect_args,
        )
    return create_async_engine(
        url,
        echo=is_dev,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        connect_args=connect_args,
    )


engine = _create_engine(settings.database_url)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all database tables on startup.
    
    If the primary PostgreSQL database connection fails, smoothly fall back to
    local SQLite database so the application is always functional.
    """
    global engine, AsyncSessionLocal
    # Import all models to ensure they are registered with the Base metadata
    from app.models import repository, document_chunk, chat_session, message, graph  # noqa: F401

    primary_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        primary_ok = True
        logger.info("Connected to primary database: %s", settings.database_url.split("@")[-1])
    except Exception as exc:
        logger.warning(
            "Primary database connection failed (%s: %s). Switching to SQLite fallback.",
            type(exc).__name__,
            exc,
        )
        workspace = os.path.abspath(settings.workspace_dir)
        os.makedirs(workspace, exist_ok=True)
        sqlite_path = os.path.join(workspace, "repogpt.db")
        sqlite_url = f"sqlite+aiosqlite:///{sqlite_path}"
        engine = _create_engine(sqlite_url)
        AsyncSessionLocal.configure(bind=engine)
        logger.info("Initialized resilient SQLite database at %s", sqlite_path)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized successfully (primary=%s).", primary_ok)
