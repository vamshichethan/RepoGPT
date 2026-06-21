"""
summary_service.py
~~~~~~~~~~~~~~~~~~
Generates a structured GPT-4o summary of an ingested repository.

The summary is stored as JSON in Repository.summary_json so it can be
served immediately without re-generating it on every request.
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.llm import get_openai_client
from app.models.document_chunk import DocumentChunk
from app.models.repository import Repository

logger = logging.getLogger(__name__)

# Priority filenames / patterns that give the most signal about a project
_PRIORITY_FILES = [
    "readme.md",
    "readme.rst",
    "readme.txt",
    "readme",
    "main.py",
    "app.py",
    "index.js",
    "index.ts",
    "main.go",
    "main.rs",
    "main.java",
    "app.ts",
    "server.ts",
    "server.js",
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "cargo.toml",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
]

_SUMMARY_PROMPT_TEMPLATE = """\
You are an expert software architect. Analyse the following GitHub repository and produce a comprehensive JSON summary.

Repository: {owner}/{name}
URL: {github_url}
Primary Languages: {languages}
Detected Frameworks: {frameworks}
Detected Databases: {databases}
Number of Files: {num_files}
Total Lines of Code: {total_loc}

Folder Structure:
```
{folder_structure}
```

Key File Contents (sample):
---
{file_samples}
---

Respond ONLY with a valid JSON object matching this exact structure:
{{
  "project_purpose": "One or two paragraphs explaining what this project does and who it is for.",
  "tech_stack": {{
    "frontend": "Framework/library used for UI, or 'N/A'",
    "backend": "Backend framework and language, or 'N/A'",
    "database": "Primary database(s), or 'N/A'",
    "cache": "Caching layer, or 'N/A'",
    "authentication": "Auth approach/library, or 'N/A'",
    "cloud": "Cloud provider / deployment platform, or 'N/A'"
  }},
  "folder_structure": "Brief human-readable description of the top-level folder layout.",
  "modules": [
    {{
      "name": "ModuleName",
      "description": "What this module does.",
      "key_files": ["path/to/file1.py", "path/to/file2.py"]
    }}
  ],
  "dependencies": [
    {{
      "name": "dependency-name",
      "version": "x.y.z or '*' if unknown",
      "purpose": "Why this dependency is used."
    }}
  ]
}}
"""


async def generate_summary(
    repository_id: int,
    db: AsyncSession,
    folder_structure: str = "",
) -> dict:
    """Generate and persist a GPT-4o summary for *repository_id*.

    Args:
        repository_id: Primary key of the Repository record.
        db: Async database session.
        folder_structure: Pre-computed ASCII folder tree (optional).

    Returns:
        The summary dict that was persisted to Repository.summary_json.
    """
    settings = get_settings()
    openai_client = get_openai_client()

    # ------------------------------------------------------------------
    # Load repository metadata
    # ------------------------------------------------------------------
    result = await db.execute(select(Repository).where(Repository.id == repository_id))
    repo = result.scalar_one_or_none()
    if repo is None:
        raise ValueError(f"Repository {repository_id} not found.")

    # ------------------------------------------------------------------
    # Load a representative sample of chunks
    # Priority files first, then up to 50 chunks total
    # ------------------------------------------------------------------
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.repository_id == repository_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(500)  # load a wider pool to allow priority sorting
    )
    all_chunks: list[DocumentChunk] = list(chunks_result.scalars().all())

    # Score chunks: priority files get score 10, others get 0 + bonus for chunk_index=0
    def _chunk_score(chunk: DocumentChunk) -> int:
        basename = chunk.file_path.split("/")[-1].lower()
        if basename in _PRIORITY_FILES:
            return 100 - chunk.chunk_index  # earlier chunks of priority files rank higher
        if chunk.chunk_index == 0:
            return 10  # first chunk of any file is more useful
        return 0

    ranked = sorted(all_chunks, key=_chunk_score, reverse=True)
    selected = ranked[:50]

    # Build the file samples block
    sample_parts: list[str] = []
    for chunk in selected:
        sample_parts.append(
            f"### {chunk.file_path} (chunk {chunk.chunk_index})\n{chunk.chunk_content}"
        )
    file_samples = "\n\n".join(sample_parts)

    # ------------------------------------------------------------------
    # Build prompt
    # ------------------------------------------------------------------
    prompt = _SUMMARY_PROMPT_TEMPLATE.format(
        owner=repo.owner,
        name=repo.name,
        github_url=repo.github_url,
        languages=", ".join(repo.primary_languages) if repo.primary_languages else "Unknown",
        frameworks=", ".join(repo.detected_frameworks) if repo.detected_frameworks else "Unknown",
        databases=", ".join(repo.detected_databases) if repo.detected_databases else "Unknown",
        num_files=repo.num_files or 0,
        total_loc=repo.total_loc or 0,
        folder_structure=folder_structure or "Not available",
        file_samples=file_samples or "No file samples available.",
    )

    # ------------------------------------------------------------------
    # Call GPT-4o with JSON mode
    # ------------------------------------------------------------------
    logger.info("Generating summary for repository %d (%s/%s)", repository_id, repo.owner, repo.name)

    import asyncio
    max_retries = 3
    base_delay = 5.0
    response = None
    for attempt in range(max_retries):
        try:
            response = await openai_client.chat.completions.create(
                model=settings.summary_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert software architect. "
                            "You always respond with valid JSON only, no markdown fences."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=4096,
            )
            break
        except Exception as exc:
            is_rate_limit = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc) or "quota" in str(exc).lower()
            if is_rate_limit and attempt < max_retries - 1:
                logger.warning("Rate limit hit during summary. Sleeping 65 seconds to reset quota... Error: %s", exc)
                await asyncio.sleep(65)
            else:
                raise exc

    raw_json = response.choices[0].message.content or "{}"

    try:
        summary = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse summary JSON: %s | raw=%s", exc, raw_json[:500])
        summary = {
            "project_purpose": "Summary generation failed.",
            "tech_stack": {},
            "folder_structure": folder_structure,
            "modules": [],
            "dependencies": [],
        }

    # ------------------------------------------------------------------
    # Persist summary
    # ------------------------------------------------------------------
    repo.summary_json = summary
    repo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Summary persisted for repository %d.", repository_id)
    return summary
