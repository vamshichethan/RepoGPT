"""
interview.py
~~~~~~~~~~~~
API endpoint for Feature 10 – Interview Mode.
Serves a cached or freshly generated technical interview preparation report
for an ingested repository.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.schemas.interview import InterviewReport
from app.services.interview_service import generate_interview_report

router = APIRouter()


@router.get("/{id}/interview", response_model=InterviewReport)
async def get_interview_report(id: int, db: AsyncSession = Depends(get_db)):
    """Return the interview prep report for a repository.

    - **404** if the repository does not exist.
    - **400** if ingestion is not complete (status != 'ready').
    - Returns cached ``interview_json`` when available, otherwise generates
      a fresh report via GPT-4o and caches it before returning.
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

    if repo.interview_json:
        return repo.interview_json

    return await generate_interview_report(id, db)
