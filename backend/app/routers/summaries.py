"""
summaries.py
~~~~~~~~~~~~
API endpoint to retrieve the AI-generated structured summary of a repository.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.schemas.summary import SummaryResponse

router = APIRouter()


@router.get("/{id}/summary", response_model=SummaryResponse)
async def get_repository_summary(id: int, db: AsyncSession = Depends(get_db)):
    """Retrieve the generated summary of an ingested repository."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not repo.summary_json:
        raise HTTPException(
            status_code=404,
            detail="Summary not generated yet. Please wait for ingestion to complete.",
        )

    return repo.summary_json
