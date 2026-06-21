"""
architecture_service.py
~~~~~~~~~~~~~~~~~~~~~~~
Analyzes codebase structures, dependency configs, and database/deployment scripts
to infer a high-level architecture overview and generate a valid Mermaid diagram.
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

# Files that contain architectural configurations or dependency declarations
_ARCH_FILES = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "pom.xml",
    "build.gradle",
    "go.mod",
    "cargo.toml",
    "docker-compose.yml",
    "docker-compose.yaml",
    "dockerfile",
    "database.py",
    "database.ts",
    "database.js",
    "config.py",
    "config.ts",
    "config.js",
    ".env.example",
    "app.yaml",
}


_ARCH_PROMPT_TEMPLATE = """\
You are a Principal Software Architect. Your job is to analyze the following GitHub repository and generate a high-level architecture overview.

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

Key Code and Configuration Snippets (sample):
---
{config_samples}
---

Your task is to infer:
1. **Frontend Layer**: What technology is used, how it interacts with the backend.
2. **Backend Layer**: Frameworks, design patterns, API structures.
3. **Database Layer**: Types of databases (Relational, NoSQL, Vector) and ORMs.
4. **Cache/Queue Layer**: Redis, Memcached, RabbitMQ, Celery, etc.
5. **External Services/APIs**: Third-party APIs (Stripe, SendGrid, Auth0, AWS, OpenAI, etc.).
6. **Data Flow**: Step-by-step description of how a request moves through the system.

You MUST respond with a valid JSON object matching this exact structure:
{{
  "architecture_summary": "A 2-3 paragraph high-level architectural overview describing the system design (Monolith, Microservices, Serverless, etc.) and layout.",
  "mermaid_code": "flowchart TD\\n  subgraph User[Client Layer]\\n    A[\\\"Client App\\\"]\\n  end\\n  subgraph App[Application Layer]\\n    B[\\\"Backend API\\\"]\\n  end\\n  A --> B",
  "service_dependencies": [
    {{
      "service": "Service or Component Name (e.g. Next.js Frontend)",
      "depends_on": "Dependent Component Name (e.g. FastAPI Backend)",
      "description": "Why and how they interact (e.g. Fetches posts and submits contact forms via REST API)."
    }}
  ],
  "tech_stack_breakdown": {{
    "Frontend": "Frontend technologies or 'N/A'",
    "Backend": "Backend frameworks and languages or 'N/A'",
    "Database": "Primary database(s) or 'N/A'",
    "Cache": "Caching layers or 'N/A'",
    "External APIs": "Third party integrations or 'N/A'"
  }},
  "data_flow_description": "A bulleted description of how data flows (e.g., '1. Client submits auth request -> 2. Backend validates with Postgres -> 3. Token returned to browser')."
}}

CRITICAL RULES FOR MERMAID DIAGRAM:
1. Generate a valid `flowchart TD` or `flowchart LR` diagram.
2. Enclose ALL node labels in double quotes (e.g., `A[\"Next.js Frontend\"]` instead of `A[Next.js Frontend]`) to avoid syntax compilation failures from spaces, hyphens, brackets, or other symbols.
3. Do NOT use markdown code fences inside the JSON values.
4. Use standard shape notations: `A[\"Label\"]` for rectangles, `B[(\"Label\")]` for databases, `C{{\\\"Label\\\"}}` for decisions, `D[\\\"Label\\\"]` for normal nodes.
"""


async def generate_architecture(
    repository_id: int,
    db: AsyncSession,
    folder_structure: str = "",
) -> dict:
    """Analyze codebase files and generate/persist an ArchitectureResponse JSON."""
    settings = get_settings()
    openai_client = get_openai_client()

    logger.info("Extracting architecture for repository %d", repository_id)

    # 1. Fetch repository record
    result = await db.execute(select(Repository).where(Repository.id == repository_id))
    repo = result.scalar_one_or_none()
    if repo is None:
        raise ValueError(f"Repository {repository_id} not found.")

    # 2. Get configuration files and priority codebase files
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.repository_id == repository_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(1000)
    )
    all_chunks = list(chunks_result.scalars().all())

    # Filter chunks belonging to architectural config files
    selected_chunks = []
    seen_files = set()

    for chunk in all_chunks:
        basename = chunk.file_path.split("/")[-1].lower()
        if basename in _ARCH_FILES or any(pat in chunk.file_path.lower() for pat in ["k8s", "deploy", "kubernetes", "infra"]):
            if chunk.file_path not in seen_files:
                selected_chunks.append(chunk)
                seen_files.add(chunk.file_path)

    # If we didn't find enough configuration files, supplement with README and main entry points
    if len(selected_chunks) < 15:
        for chunk in all_chunks:
            basename = chunk.file_path.split("/")[-1].lower()
            if any(p in basename for p in ["readme", "main", "app", "index", "server"]):
                if chunk.file_path not in seen_files:
                    selected_chunks.append(chunk)
                    seen_files.add(chunk.file_path)
            if len(seen_files) >= 25:
                break

    # Format config samples block
    sample_parts = []
    for chunk in selected_chunks[:30]:  # limit to top 30 files to fit context window
        sample_parts.append(
            f"### FILE: {chunk.file_path}\n{chunk.chunk_content}"
        )
    config_samples = "\n\n".join(sample_parts)

    # 3. Format Prompt
    prompt = _ARCH_PROMPT_TEMPLATE.format(
        owner=repo.owner,
        name=repo.name,
        github_url=repo.github_url,
        languages=", ".join(repo.primary_languages) if repo.primary_languages else "Unknown",
        frameworks=", ".join(repo.detected_frameworks) if repo.detected_frameworks else "Unknown",
        databases=", ".join(repo.detected_databases) if repo.detected_databases else "Unknown",
        num_files=repo.num_files or 0,
        total_loc=repo.total_loc or 0,
        folder_structure=folder_structure or "Not available",
        config_samples=config_samples or "No config samples available.",
    )

    # 4. Invoke LLM with JSON format support
    import asyncio
    max_retries = 3
    base_delay = 5.0
    response = None
    for attempt in range(max_retries):
        try:
            response = await openai_client.chat.completions.create(
                model=settings.chat_model,  # use gpt-4o for best reasoning
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a Senior Software Architect. "
                            "You respond ONLY with a valid JSON object matching the requested schema. "
                            "Ensure your Mermaid syntax is clean and syntax-valid."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            break
        except Exception as exc:
            is_rate_limit = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc) or "quota" in str(exc).lower()
            if is_rate_limit and attempt < max_retries - 1:
                logger.warning("Rate limit hit during architecture generation. Sleeping 65 seconds to reset quota... Error: %s", exc)
                await asyncio.sleep(65)
            else:
                raise exc

    raw_json = response.choices[0].message.content or "{}"

    try:
        arch_data = json.loads(raw_json)
        # Quick validation of keys
        for key in ["architecture_summary", "mermaid_code", "service_dependencies", "tech_stack_breakdown", "data_flow_description"]:
            if key not in arch_data:
                raise KeyError(f"Missing key: {key}")
    except Exception as exc:
        logger.error("Failed to parse architecture JSON: %s | raw=%s", exc, raw_json[:800])
        # Fallback dummy JSON
        arch_data = {
            "architecture_summary": "Architecture extraction failed.",
            "mermaid_code": "flowchart TD\n  A[\"Failed to generate diagram\"]",
            "service_dependencies": [],
            "tech_stack_breakdown": {
                "Frontend": "N/A",
                "Backend": "N/A",
                "Database": "N/A",
                "Cache": "N/A",
                "External APIs": "N/A"
            },
            "data_flow_description": "Data flow mapping failed."
        }

    # 5. Persist architecture data
    repo.architecture_json = arch_data
    repo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Successfully persisted architecture for repository %d", repository_id)
    return arch_data
