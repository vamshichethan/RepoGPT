import logging
from functools import lru_cache

from qdrant_client import QdrantClient

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    """Return a cached singleton Qdrant client instance.

    Supports both local Qdrant (no API key) and Qdrant Cloud (api_key required).
    """
    settings = get_settings()
    logger.info("Initializing Qdrant client at %s", settings.qdrant_url)
    kwargs: dict = {"url": settings.qdrant_url}
    if settings.qdrant_api_key:
        kwargs["api_key"] = settings.qdrant_api_key
    return QdrantClient(**kwargs)
