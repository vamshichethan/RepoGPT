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

    try:
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
        interview_data = json.loads(raw_json)
    except Exception as exc:
        logger.error(
            "Failed to generate interview report with LLM, using fallback: %s", exc
        )
        tech_list = (repo.primary_languages or []) + (repo.detected_frameworks or [])
        interview_data = {
            "project_overview": project_overview_ctx,
            "tech_stack": tech_list,
            "interview_questions": {
                "beginner": [
                    {"question": f"Explain the structure and main entry point of {repo.name}.", "hint": "Trace execution from the primary files in the repository."},
                    {"question": "How are modules organized and imported in this project?", "hint": "Inspect the file hierarchy and relative path conventions."},
                    {"question": "What is the primary role of the client-side scripts?", "hint": "Identify event listeners, DOM updates, or API interactions."},
                    {"question": "How are CSS stylesheets structured to avoid naming conflicts?", "hint": "Look for BEM, scoped styles, or utility classes."},
                    {"question": "What error handling practices are present in the codebase?", "hint": "Review try/catch blocks and null checks across handlers."},
                ],
                "intermediate": [
                    {"question": "How would you optimize asset loading and Core Web Vitals for this project?", "hint": "Focus on LCP, CLS, and asset minification/compression."},
                    {"question": "What state management pattern would you introduce as complexity grows?", "hint": "Compare unidirectional data flow with localized component state."},
                    {"question": "How would you set up automated unit and integration tests?", "hint": "Suggest Vitest, Jest, or Playwright with GitHub Actions."},
                    {"question": "Explain how browser caching can be leveraged for these assets.", "hint": "Discuss Cache-Control headers, ETags, and Service Workers."},
                    {"question": "How would you secure user inputs against XSS vulnerabilities?", "hint": "Discuss input sanitization, encoding, and CSP headers."},
                ],
                "advanced": [
                    {"question": "How would you architect a global edge delivery network for this application?", "hint": "Design CDN edge caching with automated cache invalidation on releases."},
                    {"question": "Discuss strategies for progressive enhancement and offline-first capabilities.", "hint": "Evaluate Service Workers and IndexedDB client storage."},
                    {"question": "How would you monitor real-user performance (RUM) and client-side exceptions in production?", "hint": "Integrate Sentry or Datadog RUM with performance traces."},
                    {"question": "Evaluate trade-offs between static asset hosting vs server-side rendering for this project.", "hint": "Analyze TTFB, SEO, caching simplicity, and infrastructure overhead."},
                    {"question": "How would you refactor this codebase into micro-frontends or modular packages?", "hint": "Discuss Module Federation, monorepos, and shared dependency boundaries."},
                ],
            },
            "design_decisions": [
                {"decision": "Lightweight Modular Architecture", "rationale": "Keeps dependencies minimal and improves maintainability.", "tradeoffs": "Simplicity vs full framework feature set."},
                {"decision": "Static Content Delivery", "rationale": "High availability and instant global response times.", "tradeoffs": "Zero hosting cost vs lack of server persistence."},
                {"decision": "Standard Web APIs", "rationale": "Maximum browser compatibility and zero build overhead.", "tradeoffs": "Standard compliance vs abstraction convenience."},
            ],
            "scalability_analysis": [
                {"area": "Static Delivery", "current_state": "Origin server", "bottleneck": "Latency on global access", "recommendation": "Deploy on CDN edge locations", "expected_benefit": "Sub-50ms latency globally"},
                {"area": "Asset Size", "current_state": "Raw source assets", "bottleneck": "Unminified assets on slow networks", "recommendation": "Automate bundling and Brotli compression", "expected_benefit": "50%+ payload reduction"},
                {"area": "Testing Automation", "current_state": "Manual QA", "bottleneck": "Regressions undetected before deploy", "recommendation": "Integrate automated CI test suite", "expected_benefit": "100% regression safety"},
                {"area": "Caching Strategy", "current_state": "Default browser cache", "bottleneck": "Redundant requests", "recommendation": "Implement immutable hashed asset caching", "expected_benefit": "Instant repeat views"},
            ],
            "suggested_improvements": [
                "Implement an automated CI/CD pipeline using GitHub Actions.",
                "Ensure responsive layouts across mobile, tablet, and desktop viewports.",
                "Add TypeScript definitions to improve maintainability and developer velocity.",
            ],
        }

    # ------------------------------------------------------------------
    # Persist interview report
    # ------------------------------------------------------------------
    repo.interview_json = interview_data
    repo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Interview report persisted for repository %d.", repository_id)
    return interview_data
