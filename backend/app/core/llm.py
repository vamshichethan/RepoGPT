import logging
from functools import lru_cache

from openai import AsyncOpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_openai_client() -> AsyncOpenAI:
    """Return a cached singleton AsyncOpenAI client instance."""
    settings = get_settings()
    logger.info("Initializing AsyncOpenAI client.")
    base_url = settings.openai_base_url.strip() if settings.openai_base_url else None
    return AsyncOpenAI(
        api_key=settings.openai_api_key or "missing-api-key",
        base_url=base_url,
    )
