"""
main.py
~~~~~~~
FastAPI entry point for the RepoGPT backend.
Configures middleware, logging, database initialization, and includes API routers.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import repositories, summaries, chat, architectures, productivity
from app.routers import interview, docs, pr_review, knowledge_graph

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events manager (startup/shutdown)."""
    logger.info("Starting up RepoGPT API backend...")

    # Initialize SQLAlchemy database tables
    try:
        await init_db()
    except Exception as exc:
        logger.critical("Database initialization failed: %s", exc)
        raise exc

    # Initialize Neo4j constraints (non-fatal if Neo4j is unavailable)
    try:
        from app.core.neo4j_client import ensure_neo4j_constraints
        await ensure_neo4j_constraints()
    except Exception as exc:
        logger.warning("Neo4j constraint initialization skipped (Neo4j may not be running): %s", exc)

    yield

    logger.info("Shutting down RepoGPT API backend...")

    # Gracefully close Neo4j driver
    try:
        from app.core.neo4j_client import close_neo4j_driver
        await close_neo4j_driver()
    except Exception as exc:
        logger.warning("Neo4j driver close error: %s", exc)


app = FastAPI(
    title="RepoGPT API Backend",
    description="AI-powered GitHub repository ingestion, summary, and RAG chat with Knowledge Graph.",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS — reads from CORS_ORIGINS env var (comma-separated list or "*")
def _get_cors_origins() -> list[str]:
    from app.config import get_settings
    raw = (get_settings().cors_origins or "*").strip()
    if raw == "*":
        return ["*"]
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    for default_origin in ["https://repogpt-nine.vercel.app", "http://localhost:3000"]:
        if default_origin not in origins:
            origins.append(default_origin)
    return origins


_cors_origins = _get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$" if _cors_origins != ["*"] else None,
    allow_credentials=_cors_origins != ["*"],  # credentials not allowed with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repositories.router, prefix="/api/repositories", tags=["Repositories"])
app.include_router(summaries.router, prefix="/api/repositories", tags=["Summaries"])
app.include_router(architectures.router, prefix="/api/repositories", tags=["Architecture"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(productivity.router, prefix="/api", tags=["Productivity"])
app.include_router(interview.router, prefix="/api/repositories", tags=["Interview"])
app.include_router(docs.router, prefix="/api/repositories", tags=["Docs"])
app.include_router(pr_review.router, prefix="/api/repositories", tags=["PR Review"])
app.include_router(knowledge_graph.router, prefix="/api/repositories", tags=["Knowledge Graph"])


@app.get("/health")
async def health():
    """Liveness probe / health check."""
    return {"status": "ok", "service": "repogpt-backend"}


@app.get("/")
async def root():
    """Root metadata endpoint."""
    return {
        "message": "Welcome to RepoGPT API Backend",
        "docs_url": "/docs",
        "health_url": "/health",
    }
