"""
ingestion_service.py
~~~~~~~~~~~~~~~~~~~~
Orchestrates the full ingestion pipeline for a GitHub repository:
  1. Clone the repository
  2. Scan files and detect metadata
  3. Chunk files with LangChain RecursiveCharacterTextSplitter
  4. Embed chunks via OpenAI and upsert to Qdrant
  5. Generate GPT-4o summary
  6. Mark status as "ready"

All status updates are written back to PostgreSQL so the frontend can poll
for real-time progress.
"""

import asyncio
import logging
import os
import re
import shutil
import uuid
from datetime import datetime, timezone

from langchain.text_splitter import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI
from qdrant_client.models import Distance, PointStruct, VectorParams
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.llm import get_openai_client
from app.core.qdrant_client import get_qdrant_client
from app.database import AsyncSessionLocal
from app.models.document_chunk import DocumentChunk
from app.models.repository import Repository
from app.services.git_service import (
    FileInfo,
    clone_repository,
    detect_databases,
    detect_frameworks,
    detect_languages,
    get_folder_structure,
    scan_files,
)
from app.services.summary_service import generate_summary
from app.services.architecture_service import generate_architecture

logger = logging.getLogger(__name__)

# Embedding vector dimension for text-embedding-3-small
# Number of chunks to embed per API call
_EMBED_BATCH_SIZE = 100
_STATUS_ERROR_MAX_CHARS = 220


# ---------------------------------------------------------------------------
# Status helpers
# ---------------------------------------------------------------------------


async def _update_status(
    db: AsyncSession,
    repo_id: int,
    status: str,
    message: str | None = None,
) -> None:
    """Persist an updated status (and optional message) for *repo_id*."""
    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = result.scalar_one_or_none()
    if repo is None:
        return
    repo.status = status
    repo.status_message = message
    repo.updated_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("Repository %d → status=%s | %s", repo_id, status, message or "")


def _compact_external_error(exc: Exception) -> str:
    """Return a short, user-safe external service error summary."""
    message = " ".join(str(exc).split())
    message = re.sub(
        r"(?i)(api[-_ ]?key|authorization|token|password)([=: ]+)(\S+)",
        r"\1\2[redacted]",
        message,
    )
    if len(message) > _STATUS_ERROR_MAX_CHARS:
        return f"{message[: _STATUS_ERROR_MAX_CHARS - 3]}..."
    return message or exc.__class__.__name__


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------


async def _embed_texts(
    client: AsyncOpenAI,
    texts: list[str],
    model: str,
) -> list[list[float]]:
    """Embed *texts* using the OpenAI embeddings API with exponential backoff on rate limits.

    Returns a list of embedding vectors in the same order as *texts*.
    """
    if not texts:
        return []
    settings = get_settings()
    # Note: Only pass dimensions if the model supports it or if it is configured
    kwargs = {}
    if settings.embedding_dim:
        kwargs["dimensions"] = settings.embedding_dim

    max_retries = 5
    for attempt in range(max_retries):
        try:
            response = await client.embeddings.create(input=texts, model=model, **kwargs)
            return [item.embedding for item in response.data]
        except Exception as exc:
            is_rate_limit = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc) or "quota" in str(exc).lower()
            if is_rate_limit and attempt < max_retries - 1:
                logger.warning(
                    "Rate limit hit during embedding. Sleeping 65 seconds to reset quota (attempt %d/%d)... Error: %s",
                    attempt + 1,
                    max_retries,
                    exc,
                )
                await asyncio.sleep(65)
            else:
                raise exc


# ---------------------------------------------------------------------------
# Qdrant collection helpers
# ---------------------------------------------------------------------------


def _ensure_qdrant_collection(collection_name: str) -> None:
    """Create the Qdrant collection if it does not already exist, or recreate if dimensions mismatch."""
    settings = get_settings()
    qdrant = get_qdrant_client()
    existing = {c.name for c in qdrant.get_collections().collections}
    
    if collection_name in existing:
        try:
            info = qdrant.get_collection(collection_name=collection_name)
            vectors_config = info.config.params.vectors
            size = None
            if hasattr(vectors_config, "size"):
                size = vectors_config.size
            elif isinstance(vectors_config, dict) and "size" in vectors_config:
                size = vectors_config["size"]
            
            if size is not None and size != settings.embedding_dim:
                logger.warning(
                    "Collection %s exists with dimension %d, but config expects %d. Recreating.",
                    collection_name,
                    size,
                    settings.embedding_dim,
                )
                qdrant.delete_collection(collection_name=collection_name)
                existing.remove(collection_name)
        except Exception as exc:
            logger.warning("Error checking collection %s dimension: %s", collection_name, exc)

    if collection_name not in existing:
        qdrant.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=settings.embedding_dim, distance=Distance.COSINE),
        )
        logger.info("Created Qdrant collection: %s with dimension %d", collection_name, settings.embedding_dim)
    else:
        logger.info("Qdrant collection already exists: %s", collection_name)


# ---------------------------------------------------------------------------
# Main ingestion pipeline
# ---------------------------------------------------------------------------


async def run_ingestion(repository_id: int) -> None:
    """Execute the full ingestion pipeline for *repository_id*.

    This function is designed to run as a background task. It creates its own
    database session so it is independent of the request lifecycle.
    """
    settings = get_settings()
    openai_client = get_openai_client()

    async with AsyncSessionLocal() as db:
        try:
            # ------------------------------------------------------------------
            # Load repository record
            # ------------------------------------------------------------------
            result = await db.execute(
                select(Repository).where(Repository.id == repository_id)
            )
            repo = result.scalar_one_or_none()
            if repo is None:
                logger.error("Repository %d not found; aborting ingestion.", repository_id)
                return

            github_url = repo.github_url
            collection_name = f"repo_{repository_id}"
            repo_dir = os.path.join(
                os.path.abspath(settings.workspace_dir),
                f"{repo.owner}_{repo.name}_{repository_id}",
            )

            # ------------------------------------------------------------------
            # Step 1: Clone
            # ------------------------------------------------------------------
            await _update_status(db, repository_id, "cloning", "Cloning repository…")

            # Remove stale directory if present
            if os.path.exists(repo_dir):
                shutil.rmtree(repo_dir, ignore_errors=True)
            os.makedirs(repo_dir, exist_ok=True)

            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: clone_repository(
                    github_url,
                    repo_dir,
                    settings.github_token,
                ),
            )

            # ------------------------------------------------------------------
            # Step 2: Scan files and detect metadata
            # ------------------------------------------------------------------
            await _update_status(db, repository_id, "scanning", "Scanning files…")

            files: list[FileInfo] = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: scan_files(repo_dir, settings.max_files, settings.max_repo_size_mb),
            )

            languages = detect_languages(files)
            frameworks = detect_frameworks(files)
            databases = detect_databases(files)
            folder_structure = get_folder_structure(repo_dir, max_depth=3)

            total_loc = sum(f.line_count for f in files)

            # Collect top-level dependencies from package.json / requirements.txt
            deps: dict[str, str] = {}
            for f in files:
                if os.path.basename(f.path) == "package.json":
                    try:
                        import json as _json
                        pkg = _json.loads(f.content)
                        deps.update(pkg.get("dependencies", {}))
                    except Exception:
                        pass

            # Persist metadata
            result = await db.execute(
                select(Repository).where(Repository.id == repository_id)
            )
            repo = result.scalar_one()
            repo.primary_languages = languages
            repo.detected_frameworks = frameworks
            repo.detected_databases = databases
            repo.num_files = len(files)
            repo.total_loc = total_loc
            repo.detected_dependencies = deps
            repo.qdrant_collection = collection_name
            await db.commit()

            logger.info(
                "Scanned %d files | LOC=%d | langs=%s | frameworks=%s",
                len(files),
                total_loc,
                languages,
                frameworks,
            )

            # ------------------------------------------------------------------
            # Step 3: Chunk files
            # ------------------------------------------------------------------
            await _update_status(
                db, repository_id, "chunking", f"Chunking {len(files)} files…"
            )

            splitter = RecursiveCharacterTextSplitter(
                chunk_size=settings.chunk_size,
                chunk_overlap=settings.chunk_overlap,
                add_start_index=True,
            )

            # List of (file_path, chunk_text, chunk_index)
            chunks: list[tuple[str, str, int]] = []
            for file_info in files:
                if not file_info.content.strip():
                    continue
                doc_chunks = splitter.split_text(file_info.content)
                for idx, chunk_text in enumerate(doc_chunks):
                    chunks.append((file_info.path, chunk_text, idx))

            logger.info("Total chunks: %d", len(chunks))

            # ------------------------------------------------------------------
            # Step 4: Embed and upsert to Qdrant
            # ------------------------------------------------------------------
            vector_warning: str | None = None
            all_db_chunks: list[DocumentChunk] = []

            if chunks:
                await _update_status(
                    db,
                    repository_id,
                    "embedding",
                    f"Embedding {len(chunks)} chunks…",
                )

                try:
                    qdrant_client = get_qdrant_client()
                    _ensure_qdrant_collection(collection_name)

                    # Process in batches
                    for batch_start in range(0, len(chunks), _EMBED_BATCH_SIZE):
                        batch = chunks[batch_start: batch_start + _EMBED_BATCH_SIZE]
                        texts = [c[1] for c in batch]

                        embeddings = await _embed_texts(
                            openai_client, texts, settings.embedding_model
                        )

                        points: list[PointStruct] = []
                        for (file_path, chunk_text, chunk_idx), embedding in zip(batch, embeddings):
                            point_id = str(uuid.uuid4())
                            points.append(
                                PointStruct(
                                    id=point_id,
                                    vector=embedding,
                                    payload={
                                        "file_path": file_path,
                                        "chunk_index": chunk_idx,
                                        "content": chunk_text,
                                        "repository_id": repository_id,
                                    },
                                )
                            )
                            all_db_chunks.append(
                                DocumentChunk(
                                    repository_id=repository_id,
                                    file_path=file_path,
                                    chunk_content=chunk_text,
                                    chunk_index=chunk_idx,
                                    embedding_id=point_id,
                                )
                            )

                        qdrant_client.upsert(
                            collection_name=collection_name,
                            points=points,
                            wait=True,
                        )
                        logger.debug(
                            "Upserted batch %d-%d to Qdrant",
                            batch_start,
                            batch_start + len(batch) - 1,
                        )
                        await asyncio.sleep(0.5)

                    logger.info("Indexed %d document chunks in Qdrant.", len(all_db_chunks))
                except Exception as vector_exc:
                    vector_warning = (
                        "Vector search is unavailable; repository summary was generated "
                        f"without Qdrant indexing. Details: {_compact_external_error(vector_exc)}"
                    )
                    logger.warning(
                        "Vector indexing failed for repository %d; continuing without Qdrant: %s",
                        repository_id,
                        vector_exc,
                        exc_info=True,
                    )
                    all_db_chunks = [
                        DocumentChunk(
                            repository_id=repository_id,
                            file_path=file_path,
                            chunk_content=chunk_text,
                            chunk_index=chunk_idx,
                            embedding_id=None,
                        )
                        for file_path, chunk_text, chunk_idx in chunks
                    ]
            else:
                vector_warning = "No readable text chunks were found for vector indexing."

            # Bulk-insert DocumentChunk rows even if vector indexing is unavailable.
            if all_db_chunks:
                db.add_all(all_db_chunks)
                await db.commit()
            logger.info("Saved %d document chunks to PostgreSQL.", len(all_db_chunks))

            # ------------------------------------------------------------------
            # Step 5: Generate summary
            # ------------------------------------------------------------------
            await _update_status(
                db, repository_id, "summarizing", "Generating repository summary…"
            )

            await generate_summary(repository_id, db, folder_structure=folder_structure)

            # ------------------------------------------------------------------
            # Step 6: Extract architecture
            # ------------------------------------------------------------------
            await _update_status(
                db, repository_id, "architecting", "Extracting high-level architecture diagram…"
            )

            await generate_architecture(repository_id, db, folder_structure=folder_structure)

            # ------------------------------------------------------------------
            # Step 6.5: Knowledge Graph Building (Neo4j)
            # ------------------------------------------------------------------
            await _update_status(
                db, repository_id, "graph_building", "Building knowledge graph…"
            )
            try:
                from app.services.graph_service import GraphService
                files_content_dict: dict[str, tuple[bytes, str]] = {}
                for f in files:
                    if f.path.endswith(".py"):
                        lang = "python"
                    elif f.path.endswith((".ts", ".tsx")):
                        lang = "typescript"
                    elif f.path.endswith((".js", ".jsx", ".mjs")):
                        lang = "javascript"
                    else:
                        continue
                    files_content_dict[f.path] = (f.content.encode("utf-8"), lang)

                graph_svc = GraphService()
                await graph_svc.build_graph_for_repo(repository_id, files_content_dict)
                logger.info(
                    "Knowledge graph built for repository %d (%d source files indexed)",
                    repository_id,
                    len(files_content_dict),
                )
            except Exception as graph_exc:
                # Non-fatal: graph building failure should not block ingestion
                logger.warning(
                    "Knowledge graph build failed for repository %d (continuing): %s",
                    repository_id,
                    graph_exc,
                )

            # ------------------------------------------------------------------
            # Step 7: Ready
            # ------------------------------------------------------------------
            ready_message = "Ingestion complete."
            if vector_warning:
                ready_message = f"Ingestion complete. {vector_warning}"
            await _update_status(db, repository_id, "ready", ready_message)
            logger.info("Repository %d ingestion complete.", repository_id)

        except Exception as exc:
            logger.exception("Ingestion failed for repository %d: %s", repository_id, exc)
            try:
                await _update_status(
                    db,
                    repository_id,
                    "error",
                    f"Ingestion failed: {exc}",
                )
            except Exception:
                pass
