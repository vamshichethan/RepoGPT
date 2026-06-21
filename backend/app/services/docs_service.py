"""
docs_service.py
~~~~~~~~~~~~~~~
Generates four production-quality markdown documentation files for an ingested
repository using GPT-4o:
  - README.md
  - ARCHITECTURE.md  (embeds the Mermaid diagram from architecture_json)
  - API_DOCS.md
  - ONBOARDING.md

The result is persisted to Repository.docs_json to avoid regenerating on every
request.
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

# Prioritise files that are most useful for generating documentation
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
    "server.ts",
    "server.js",
    "app.ts",
]

# Config / infra files for onboarding & architecture sections
_CONFIG_FILES = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "pom.xml",
    "build.gradle",
    "go.mod",
    "cargo.toml",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env.example",
    "makefile",
    "justfile",
}

# Route/API files for API_DOCS
_ROUTE_PATTERNS = ["router", "route", "routes", "api", "endpoint", "handler", "controller"]

_DOCS_PROMPT_TEMPLATE = """\
You are a world-class technical writer. Your task is to generate four complete, \
production-quality documentation files for the following GitHub repository based \
on the actual code and configuration provided.

Repository: {owner}/{name}
URL: {github_url}
Primary Languages: {languages}
Detected Frameworks: {frameworks}
Detected Databases: {databases}
Number of Files: {num_files}
Total Lines of Code: {total_loc}

Project Summary:
{project_overview}

Architecture Overview:
{architecture_summary}

Data Flow:
{data_flow}

Folder Structure:
```
{folder_structure}
```

Mermaid Architecture Diagram (embed verbatim in ARCHITECTURE.md):
```mermaid
{mermaid_code}
```

Key File Contents (sample):
---
{file_samples}
---

Respond ONLY with a valid JSON object matching this EXACT structure \
(no markdown fences around the JSON, but DO use markdown inside each value string):
{{
  "readme": "Full README.md content in GitHub Flavored Markdown. Must include: project name, badges (build, license), description, features list, tech stack table, quick-start installation steps, usage examples, API overview, contributing guide, license section.",
  "architecture_doc": "Full ARCHITECTURE.md content in GitHub Flavored Markdown. Must embed the Mermaid diagram verbatim inside a ```mermaid fence. Include: system overview, component descriptions, service dependency table, data flow walkthrough, technology choices rationale.",
  "api_docs": "Full API_DOCS.md content in GitHub Flavored Markdown. Document every API endpoint visible in the code samples. For each endpoint include: method, path, description, request body schema (if any), query params, response schema, example request/response using curl or fetch. Group endpoints by resource.",
  "onboarding": "Full ONBOARDING.md content in GitHub Flavored Markdown. Must include: prerequisites (software & versions), step-by-step local setup (clone, install deps, configure env vars with example values, run database migrations, start dev server), running tests, common developer workflows, troubleshooting FAQ."
}}

IMPORTANT RULES:
- Every document must be complete and immediately usable — not a template with placeholders.
- Base all content on the ACTUAL code and configuration files provided above.
- Use real endpoint paths, real environment variable names, real dependencies from the codebase.
- Markdown headings, code blocks, tables, and lists must be properly formatted.
- Do NOT truncate or abbreviate any section.
"""


async def generate_docs(
    repository_id: int,
    db: AsyncSession,
) -> dict:
    """Generate and persist GPT-4o documentation for *repository_id*.

    Args:
        repository_id: Primary key of the Repository record.
        db: Async database session.

    Returns:
        The docs dict persisted to Repository.docs_json.
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
    # Load up to 40 document chunks with priority:
    #   1. README files
    #   2. Route / API handler files
    #   3. Main entry points
    #   4. Docker / deployment config files
    # ------------------------------------------------------------------
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.repository_id == repository_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(800)  # wide pool for priority sorting
    )
    all_chunks: list[DocumentChunk] = list(chunks_result.scalars().all())

    def _chunk_score(chunk: DocumentChunk) -> int:
        basename = chunk.file_path.split("/")[-1].lower()
        path_lower = chunk.file_path.lower()

        # README is top priority
        if any(basename.startswith(r) for r in ["readme"]):
            return 200 - chunk.chunk_index

        # Config / deployment files
        if basename in _CONFIG_FILES:
            return 150 - chunk.chunk_index

        # Route / API handler files
        if any(pat in path_lower for pat in _ROUTE_PATTERNS):
            return 130 - chunk.chunk_index

        # Priority entry-point files
        if basename in _PRIORITY_FILES:
            return 100 - chunk.chunk_index

        # First chunk of any file is more useful
        if chunk.chunk_index == 0:
            return 10

        return 0

    ranked = sorted(all_chunks, key=_chunk_score, reverse=True)
    selected = ranked[:40]

    sample_parts: list[str] = []
    for chunk in selected:
        sample_parts.append(
            f"### {chunk.file_path} (chunk {chunk.chunk_index})\n{chunk.chunk_content}"
        )
    file_samples = "\n\n".join(sample_parts)

    # ------------------------------------------------------------------
    # Extract context from summary and architecture JSON
    # ------------------------------------------------------------------
    summary = repo.summary_json or {}
    arch = repo.architecture_json or {}

    project_overview_ctx = summary.get("project_purpose", "Not available.")
    architecture_summary_ctx = arch.get("architecture_summary", "Not available.")
    data_flow_ctx = arch.get("data_flow_description", "Not available.")
    folder_structure_ctx = summary.get("folder_structure", "Not available.")
    mermaid_code_ctx = arch.get(
        "mermaid_code",
        'flowchart TD\n  A["Architecture diagram not available"]',
    )

    # ------------------------------------------------------------------
    # Build prompt
    # ------------------------------------------------------------------
    prompt = _DOCS_PROMPT_TEMPLATE.format(
        owner=repo.owner,
        name=repo.name,
        github_url=repo.github_url,
        languages=", ".join(repo.primary_languages) if repo.primary_languages else "Unknown",
        frameworks=", ".join(repo.detected_frameworks) if repo.detected_frameworks else "Unknown",
        databases=", ".join(repo.detected_databases) if repo.detected_databases else "Unknown",
        num_files=repo.num_files or 0,
        total_loc=repo.total_loc or 0,
        project_overview=project_overview_ctx,
        architecture_summary=architecture_summary_ctx,
        data_flow=data_flow_ctx,
        folder_structure=folder_structure_ctx,
        mermaid_code=mermaid_code_ctx,
        file_samples=file_samples or "No file samples available.",
    )

    # ------------------------------------------------------------------
    # Call GPT-4o with JSON mode
    # ------------------------------------------------------------------
    logger.info(
        "Generating auto-documentation for repository %d (%s/%s)",
        repository_id,
        repo.owner,
        repo.name,
    )

    response = await openai_client.chat.completions.create(
        model=settings.chat_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a world-class technical writer. "
                    "You always respond with valid JSON only, no markdown fences around the JSON. "
                    "Each value in the JSON is a complete markdown document string."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=8192,
    )

    raw_json = response.choices[0].message.content or "{}"

    try:
        docs_data = json.loads(raw_json)
        # Ensure all required keys are present
        for key in ["readme", "architecture_doc", "api_docs", "onboarding"]:
            if key not in docs_data:
                raise KeyError(f"Missing key: {key}")
    except Exception as exc:
        logger.error("Failed to parse docs JSON: %s | raw=%s", exc, raw_json[:500])
        docs_data = {
            "readme": "# Documentation generation failed\n\nPlease try again.",
            "architecture_doc": "# Architecture\n\nDocumentation generation failed.",
            "api_docs": "# API Docs\n\nDocumentation generation failed.",
            "onboarding": "# Onboarding\n\nDocumentation generation failed.",
        }

    # ------------------------------------------------------------------
    # Persist docs
    # ------------------------------------------------------------------
    repo.docs_json = docs_data
    repo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Auto-documentation persisted for repository %d.", repository_id)
    return docs_data
