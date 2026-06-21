"""
interview_service.py
~~~~~~~~~~~~~~~~~~~~
Generates a structured Interview Mode report for an ingested repository using GPT-4o.

The report covers project overview, tech stack, categorised interview questions
(beginner / intermediate / advanced), key design decisions, scalability analysis,
and suggested improvements.  The result is persisted to Repository.interview_json
so it can be served without re-generating on every request.
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

# Priority filenames that provide the most signal for interview prep
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
    "cargo.toml",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "config.py",
    "config.ts",
    "database.py",
    "schema.prisma",
    "models.py",
]

_INTERVIEW_PROMPT_TEMPLATE = """\
You are an expert software engineering interviewer and technical mentor. \
Analyze the following GitHub repository thoroughly and produce a comprehensive \
technical interview preparation guide in JSON format.

Repository: {owner}/{name}
Primary Languages: {languages}
Detected Frameworks: {frameworks}
Detected Databases: {databases}
Number of Files: {num_files}
Total Lines of Code: {total_loc}

Project Summary:
{project_overview}

Architecture Overview:
{architecture_summary}

Folder Structure:
```
{folder_structure}
```

Key File Contents (sample):
---
{file_samples}
---

Respond ONLY with a valid JSON object matching this EXACT structure (no markdown fences, no extra keys):
{{
  "project_overview": "A concise 2-3 paragraph description of the project: what it does, who uses it, and the core technical challenges it solves.",
  "tech_stack": [
    {{
      "name": "Technology or library name",
      "version": "version string or 'latest' if unknown",
      "purpose": "Why this technology is used in the project."
    }}
  ],
  "interview_questions": {{
    "beginner": [
      {{
        "question": "Question text targeting junior engineers",
        "hint": "Key talking point or concept they should mention"
      }}
    ],
    "intermediate": [
      {{
        "question": "Question text targeting mid-level engineers",
        "hint": "Key talking point or concept they should mention"
      }}
    ],
    "advanced": [
      {{
        "question": "Question text targeting senior engineers",
        "hint": "Key talking point or concept they should mention"
      }}
    ]
  }},
  "design_decisions": [
    {{
      "decision": "What architectural or technical decision was made (e.g., 'Use async SQLAlchemy over sync ORM')",
      "rationale": "Why this decision was made given the project context.",
      "tradeoffs": "What is gained and what is sacrificed with this choice."
    }}
  ],
  "scalability_analysis": [
    {{
      "area": "Component name (e.g., 'Database', 'API Layer', 'Cache', 'File Storage')",
      "current_state": "How the component currently works at the scale evident in the codebase.",
      "bottleneck": "The likely bottleneck under high load.",
      "recommendation": "Concrete recommendation to address the bottleneck.",
      "expected_benefit": "Quantitative or qualitative benefit of the recommendation."
    }}
  ],
  "suggested_improvements": [
    "Improvement suggestion 1 (actionable, specific to this codebase)",
    "Improvement suggestion 2",
    "Improvement suggestion 3"
  ]
}}

Requirements:
- Generate at least 5 questions per difficulty tier (beginner, intermediate, advanced).
- Questions must reference ACTUAL code patterns, libraries, and patterns found in this specific codebase.
- Design decisions must reflect actual choices visible in the code.
- Scalability analysis should cover at least 4 distinct architectural areas.
- Suggested improvements must be specific and actionable, not generic advice.
"""


async def generate_interview_report(
    repository_id: int,
    db: AsyncSession,
) -> dict:
    """Generate and persist a GPT-4o interview report for *repository_id*.

    Args:
        repository_id: Primary key of the Repository record.
        db: Async database session.

    Returns:
        The interview report dict persisted to Repository.interview_json.
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
    # Load up to 30 top-priority document chunks
    # (README, main files, config files first)
    # ------------------------------------------------------------------
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.repository_id == repository_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(600)  # wide pool for priority sorting
    )
    all_chunks: list[DocumentChunk] = list(chunks_result.scalars().all())

    def _chunk_score(chunk: DocumentChunk) -> int:
        basename = chunk.file_path.split("/")[-1].lower()
        if basename in _PRIORITY_FILES:
            return 100 - chunk.chunk_index
        if chunk.chunk_index == 0:
            return 10
        return 0

    ranked = sorted(all_chunks, key=_chunk_score, reverse=True)
    selected = ranked[:30]

    sample_parts: list[str] = []
    for chunk in selected:
        sample_parts.append(
            f"### {chunk.file_path} (chunk {chunk.chunk_index})\n{chunk.chunk_content}"
        )
    file_samples = "\n\n".join(sample_parts)

    # ------------------------------------------------------------------
    # Extract context from previously generated summary / architecture
    # ------------------------------------------------------------------
    summary = repo.summary_json or {}
    arch = repo.architecture_json or {}

    project_overview_ctx = summary.get("project_purpose", "Not available.")
    architecture_summary_ctx = arch.get("architecture_summary", "Not available.")
    folder_structure_ctx = summary.get("folder_structure", "Not available.")

    # ------------------------------------------------------------------
    # Build prompt
    # ------------------------------------------------------------------
    prompt = _INTERVIEW_PROMPT_TEMPLATE.format(
        owner=repo.owner,
        name=repo.name,
        languages=", ".join(repo.primary_languages) if repo.primary_languages else "Unknown",
        frameworks=", ".join(repo.detected_frameworks) if repo.detected_frameworks else "Unknown",
        databases=", ".join(repo.detected_databases) if repo.detected_databases else "Unknown",
        num_files=repo.num_files or 0,
        total_loc=repo.total_loc or 0,
        project_overview=project_overview_ctx,
        architecture_summary=architecture_summary_ctx,
        folder_structure=folder_structure_ctx,
        file_samples=file_samples or "No file samples available.",
    )

    # ------------------------------------------------------------------
    # Call GPT-4o with JSON mode
    # ------------------------------------------------------------------
    logger.info(
        "Generating interview report for repository %d (%s/%s)",
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
                    "You are an expert software engineering interviewer. "
                    "You always respond with valid JSON only, no markdown fences."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw_json = response.choices[0].message.content or "{}"

    try:
        interview_data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        logger.error(
            "Failed to parse interview report JSON: %s | raw=%s", exc, raw_json[:500]
        )
        interview_data = {
            "project_overview": "Interview report generation failed.",
            "tech_stack": [],
            "interview_questions": {
                "beginner": [],
                "intermediate": [],
                "advanced": [],
            },
            "design_decisions": [],
            "scalability_analysis": [],
            "suggested_improvements": [],
        }

    # ------------------------------------------------------------------
    # Persist interview report
    # ------------------------------------------------------------------
    repo.interview_json = interview_data
    repo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Interview report persisted for repository %d.", repository_id)
    return interview_data
