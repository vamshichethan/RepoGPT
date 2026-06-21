"""
architectures.py
~~~~~~~~~~~~~~~~
API endpoint to retrieve the AI-extracted architectural analysis (Mermaid, summary, stack, flow).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.schemas.architecture import ArchitectureResponse

router = APIRouter()


@router.get("/{id}/architecture", response_model=ArchitectureResponse)
async def get_repository_architecture(id: int, db: AsyncSession = Depends(get_db)):
    """Retrieve the generated architecture extraction of an ingested repository."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not repo.architecture_json:
        raise HTTPException(
            status_code=404,
            detail="Architecture analysis not generated yet. Please wait for ingestion to complete.",
        )

    return repo.architecture_json
