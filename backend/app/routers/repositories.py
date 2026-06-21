"""
repositories.py
~~~~~~~~~~~~~~~~~~
API endpoints for managing GitHub repositories (submission, listing, status, deletion).
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.models.document_chunk import DocumentChunk
from app.schemas.repository import RepositoryCreate, RepositoryResponse, IngestionStatusResponse
from app.services.git_service import parse_github_url
from app.services.ingestion_service import run_ingestion
from app.core.qdrant_client import get_qdrant_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=RepositoryResponse)
async def create_repository(
    payload: RepositoryCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Submit a GitHub URL, register the repo in database, and trigger background ingestion."""
    github_url = payload.github_url.strip()

    try:
        owner, name = parse_github_url(github_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Check if repository already exists
    result = await db.execute(
        select(Repository).where(Repository.github_url == github_url)
    )
    existing_repo = result.scalar_one_or_none()

    if existing_repo:
        # If it exists but is in error status, let's reset it and trigger ingestion again
        if existing_repo.status == "error":
            existing_repo.status = "pending"
            existing_repo.status_message = "Ingestion restarted"
            existing_repo.updated_at = datetime.now(timezone.utc)
            await db.commit()
            background_tasks.add_task(run_ingestion, existing_repo.id)
        return existing_repo

    # Register new repository
    new_repo = Repository(
        name=name,
        owner=owner,
        github_url=github_url,
        status="pending",
        status_message="Scheduled for ingestion",
        primary_languages=[],
        detected_frameworks=[],
        detected_databases=[],
        detected_dependencies={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(new_repo)
    await db.commit()
    await db.refresh(new_repo)

    # Launch ingestion background task
    background_tasks.add_task(run_ingestion, new_repo.id)

    return new_repo


@router.get("", response_model=list[RepositoryResponse])
async def list_repositories(db: AsyncSession = Depends(get_db)):
    """List all registered repositories, newest first."""
    result = await db.execute(
        select(Repository).order_by(desc(Repository.created_at))
    )
    return list(result.scalars().all())


@router.get("/{id}", response_model=RepositoryResponse)
async def get_repository(id: int, db: AsyncSession = Depends(get_db)):
    """Get details of a single repository."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.get("/{id}/status", response_model=IngestionStatusResponse)
async def get_repository_status(id: int, db: AsyncSession = Depends(get_db)):
    """Retrieve the current ingestion status of a repository."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return IngestionStatusResponse.from_repository(repo)


@router.delete("/{id}")
async def delete_repository(id: int, db: AsyncSession = Depends(get_db)):
    """Delete a repository from database, its chunks, and clean Qdrant collections."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Delete Qdrant collection if exists
    collection_name = repo.qdrant_collection or f"repo_{id}"
    try:
        qdrant = get_qdrant_client()
        existing = {c.name for c in qdrant.get_collections().collections}
        if collection_name in existing:
            qdrant.delete_collection(collection_name=collection_name)
            logger.info("Deleted Qdrant collection: %s", collection_name)
    except Exception as exc:
        logger.warning("Failed to delete Qdrant collection: %s. Continuing...", exc)

    # Delete relational rows (CASCADE will delete related message/session/chunks, but let's do it clean)
    await db.delete(repo)
    await db.commit()

    return {"status": "ok", "message": f"Repository {id} deleted successfully."}
