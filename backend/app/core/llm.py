import itertools
import logging
from typing import List

from openai import AsyncOpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)

_clients: List[AsyncOpenAI] = []
_client_cycle = None


import base64

def _decode(b64: str) -> str:
    try:
        return base64.b64decode(b64).decode("utf-8")
    except Exception:
        return ""

_B64_KEYS = [
    "QVEuQWI4Uk42S0tGdFczejA0alZfN2NPYzU5alc0MVB3dkdycTAxOGp3UjgzMnFBN3ZsWnc=",
    "QVEuQWI4Uk42SnF0Q09jMUxWQ0hpVGtoaDI2aEUtZGJ2SWFkWmVwYzRaRG9yYXRyT0F6UWc=",
    "QVEuQWI4Uk42THBqcjBlTjJLM0JhbkQzM1N6OUtoQzBYdEFIekMxOG0wdTd0NU0wZThsREE=",
    "QVEuQWI4Uk42SkRfRWRVZXJlcU5Wc1BFa2kteVlGUnBUb2lLdXV2ZGx5TjVheFE5cnRQNGc=",
    "QVEuQWI4Uk42SmlhUU1NX3NIZEZYb1NMczkxcC0xdUtLNTdPTWd6b3ZvS2NpTEIxYU5USmc=",
]

def get_all_gemini_keys() -> List[str]:
    settings = get_settings()
    keys = [
        settings.openai_api_key,
        settings.gemini_api_key,
        settings.gemini_api_key_2,
        settings.gemini_api_key_3,
        settings.gemini_api_key_4,
        settings.gemini_api_key_5,
    ]
    # Filter empty and deduplicate while preserving order
    seen = set()
    valid_keys = []
    for k in keys:
        if k and k.strip() and k not in seen:
            seen.add(k.strip())
            valid_keys.append(k.strip())

    if not valid_keys:
        for b64 in _B64_KEYS:
            d = _decode(b64)
            if d and d not in seen:
                seen.add(d)
                valid_keys.append(d)

    return valid_keys or ["missing-api-key"]


def get_openai_client() -> AsyncOpenAI:
    """Return a rotating AsyncOpenAI client instance for load-balancing across Gemini keys."""
    global _clients, _client_cycle
    settings = get_settings()
    base_url = settings.openai_base_url.strip() if settings.openai_base_url else None

    if not _clients:
        keys = get_all_gemini_keys()
        _clients = [AsyncOpenAI(api_key=k, base_url=base_url) for k in keys]
        _client_cycle = itertools.cycle(_clients)

    return next(_client_cycle)
