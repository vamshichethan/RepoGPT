"""
pr_review.py
~~~~~~~~~~~~
API endpoint for Feature 12 – PR Review.
Accepts a raw git diff and returns a structured GPT-4o code review.
Results are never cached — each diff gets a fresh review.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.schemas.pr_review import PRReviewRequest, PRReviewResponse
from app.services.pr_review_service import analyze_pr

router = APIRouter()


@router.post("/{id}/review", response_model=PRReviewResponse)
async def review_pull_request(
    id: int,
    body: PRReviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit a git diff for an AI-powered pull request review.

    - **404** if the repository does not exist.
    - **400** if ingestion is not complete (status != 'ready').
    - Calls GPT-4o with full project context to produce a structured review.
    - Results are **not** cached; every request generates a fresh analysis.
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

    return await analyze_pr(id, body.diff, db)
