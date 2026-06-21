"""
docs.py
~~~~~~~
API endpoint for Feature 11 – Auto Documentation.
Serves cached or freshly generated production-quality markdown documentation
(README, ARCHITECTURE, API_DOCS, ONBOARDING) for an ingested repository.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.schemas.docs import DocsResponse
from app.services.docs_service import generate_docs

router = APIRouter()


@router.get("/{id}/docs", response_model=DocsResponse)
async def get_repository_docs(id: int, db: AsyncSession = Depends(get_db)):
    """Return auto-generated documentation for a repository.

    - **404** if the repository does not exist.
    - **400** if ingestion is not complete (status != 'ready').
    - Returns cached ``docs_json`` when available, otherwise generates
      fresh documentation via GPT-4o and caches it before returning.
    """
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if repo.status != "ready":
        raise HTTPException(
            status_code=400,
            detail="Repository not ready yet",
        )

    if repo.docs_json:
        return repo.docs_json

    return await generate_docs(id, db)
