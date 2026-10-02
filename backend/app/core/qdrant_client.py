import logging
import os
from functools import lru_cache

from qdrant_client import QdrantClient

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    """Return a cached singleton Qdrant client instance.

    Attempts to connect to remote Qdrant first. If unreachable or down,
    seamlessly falls back to local embedded Qdrant storage.
    """
    settings = get_settings()
    if settings.qdrant_url:
        try:
            logger.info("Connecting to remote Qdrant at %s...", settings.qdrant_url)
            kwargs: dict = {"url": settings.qdrant_url, "timeout": 4}
            if settings.qdrant_api_key:
                kwargs["api_key"] = settings.qdrant_api_key
            client = QdrantClient(**kwargs)
            # Connectivity check
            client.get_collections()
            logger.info("Successfully connected to remote Qdrant.")
            return client
        except Exception as exc:
            logger.warning(
                "Remote Qdrant unavailable (%s: %s). Falling back to local embedded Qdrant.",
                type(exc).__name__,
                exc,
            )

    storage_path = os.path.abspath(os.path.join(settings.workspace_dir, "qdrant_db"))
    os.makedirs(storage_path, exist_ok=True)
    logger.info("Initialized local embedded Qdrant at %s", storage_path)
    return QdrantClient(path=storage_path)
