"""
neo4j_client.py
~~~~~~~~~~~~~~~
Singleton Neo4j async driver for the RepoGPT backend.
Provides get_neo4j_driver() for dependency injection and close_neo4j_driver()
for graceful shutdown during the FastAPI lifespan.
"""

import logging
from typing import Optional

from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import get_settings

logger = logging.getLogger(__name__)

_driver: Optional[AsyncDriver] = None


def get_neo4j_driver() -> AsyncDriver:
    """Return the shared Neo4j async driver, initializing it on first call.

    Supports:
    - Local dev (NEO4J_AUTH=none): no username/password needed
    - Neo4j Aura / Cloud: set NEO4J_USERNAME and NEO4J_PASSWORD
    """
    global _driver
    if _driver is None:
        settings = get_settings()
        # Use auth tuple if password is provided (cloud/Aura), else no-auth (local dev)
        auth = (settings.neo4j_username, settings.neo4j_password) if settings.neo4j_password else None
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=auth,
        )
        logger.info("Neo4j driver initialized: %s (auth=%s)", settings.neo4j_uri, "yes" if auth else "no")
    return _driver


async def close_neo4j_driver() -> None:
    """Close the shared Neo4j driver gracefully."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
        logger.info("Neo4j driver closed.")


async def ensure_neo4j_constraints() -> None:
    """Create uniqueness constraints and indexes for all node types on startup."""
    driver = get_neo4j_driver()
    constraints = [
        # Uniqueness: repo_id + identifier per node type
        "CREATE CONSTRAINT file_unique IF NOT EXISTS FOR (f:File) REQUIRE (f.repo_id, f.path) IS UNIQUE",
        "CREATE CONSTRAINT class_unique IF NOT EXISTS FOR (c:Class) REQUIRE (c.repo_id, c.name, c.file_path) IS UNIQUE",
        "CREATE CONSTRAINT function_unique IF NOT EXISTS FOR (fn:Function) REQUIRE (fn.repo_id, fn.name, fn.file_path) IS UNIQUE",
        "CREATE CONSTRAINT api_unique IF NOT EXISTS FOR (a:Api) REQUIRE (a.repo_id, a.method, a.path) IS UNIQUE",
        "CREATE CONSTRAINT table_unique IF NOT EXISTS FOR (t:Table) REQUIRE (t.repo_id, t.name) IS UNIQUE",
        "CREATE CONSTRAINT service_unique IF NOT EXISTS FOR (s:Service) REQUIRE (s.repo_id, s.name) IS UNIQUE",
    ]
    async with driver.session() as session:
        for constraint in constraints:
            try:
                await session.run(constraint)
            except Exception as exc:
                # Constraint may already exist — not a fatal error
                logger.debug("Constraint creation skipped: %s | %s", constraint[:60], exc)
    logger.info("Neo4j constraints ensured.")
