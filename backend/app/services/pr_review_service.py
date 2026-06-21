"""
pr_review_service.py
~~~~~~~~~~~~~~~~~~~~
Performs an AI-powered pull request review using GPT-4o.

Unlike other services this result is NOT cached — every diff submitted gets a
fresh, context-aware review so that reviews remain accurate for the specific
changes in the diff.
"""

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.llm import get_openai_client
from app.models.repository import Repository

logger = logging.getLogger(__name__)

_PR_REVIEW_PROMPT_TEMPLATE = """\
You are a senior software engineer conducting a thorough pull request code review. \
You provide actionable, precise, and constructive feedback.

=== PROJECT CONTEXT ===
Repository: {owner}/{name}
Primary Languages: {languages}
Detected Frameworks: {frameworks}
Detected Databases: {databases}

Project Summary:
{project_overview}

Architecture Overview:
{architecture_summary}

Tech Stack Breakdown:
{tech_stack}

=== GIT DIFF TO REVIEW ===
```diff
{diff}
```

=== SEVERITY SCALE ===
- Critical: Security breach, authentication bypass, data loss, or remote code execution.
- High: Runtime crash, data corruption, incorrect business logic that causes wrong results.
- Medium: Logic bug that causes incorrect behaviour in edge cases, improper error handling.
- Low: Style issues, minor code smells, unnecessary complexity, missing docstrings.

=== INSTRUCTIONS ===
Carefully analyse the full diff above within the context of this project's architecture and \
tech stack. Respond ONLY with a valid JSON object matching this EXACT structure \
(no markdown fences, no extra keys):

{{
  "overall_score": <integer 0-100 representing holistic code quality of this PR>,
  "summary": "A concise 2-4 sentence summary of what this PR does and your overall assessment.",
  "bugs": [
    {{
      "file": "path/to/file.py",
      "line_hint": "~line 42 or function name",
      "description": "Clear description of the bug and its impact.",
      "severity": "Critical | High | Medium | Low"
    }}
  ],
  "security_issues": [
    {{
      "file": "path/to/file.py",
      "description": "Description of the security vulnerability.",
      "severity": "Critical | High | Medium | Low",
      "recommendation": "Specific remediation step."
    }}
  ],
  "code_smells": [
    {{
      "file": "path/to/file.py",
      "description": "Description of the code smell.",
      "smell_type": "e.g. Large Function, Deep Nesting, God Object, Magic Number",
      "suggestion": "Specific refactoring suggestion."
    }}
  ],
  "complexity_analysis": [
    {{
      "file": "path/to/file.py",
      "function_name": "function_or_method_name",
      "previous_complexity": <estimated cyclomatic complexity before the diff, integer>,
      "new_complexity": <estimated cyclomatic complexity after the diff, integer>,
      "risk": "Low | Medium | High",
      "recommendation": "How to reduce complexity if it increased significantly."
    }}
  ],
  "maintainability_score": <integer 0-100 reflecting how maintainable the code will be after this PR>,
  "approval_recommendation": "Approve | Approve with Changes | Request Changes",
  "testing_recommendations": [
    "Specific test case recommendation 1",
    "Specific test case recommendation 2"
  ]
}}

RULES:
- Only flag real issues visible in the diff — do not invent problems.
- approval_recommendation MUST be exactly one of: "Approve", "Approve with Changes", "Request Changes".
- overall_score and maintainability_score must be integers between 0 and 100.
- If there are no bugs, security_issues, or code_smells, return empty arrays — do not fabricate items.
- Provide at least 3 testing_recommendations that are specific to the changes in this diff.
- Reference actual file paths, function names, and line numbers from the diff wherever possible.
"""

_FALLBACK_REVIEW = {
    "overall_score": 0,
    "summary": "PR review generation failed. Please try again.",
    "bugs": [],
    "security_issues": [],
    "code_smells": [],
    "complexity_analysis": [],
    "maintainability_score": 0,
    "approval_recommendation": "Request Changes",
    "testing_recommendations": [
        "Review could not be generated — please retry.",
    ],
}

_VALID_RECOMMENDATIONS = {"Approve", "Approve with Changes", "Request Changes"}


async def analyze_pr(
    repository_id: int,
    diff: str,
    db: AsyncSession,
) -> dict:
    """Perform a GPT-4o code review of *diff* in the context of *repository_id*.

    Args:
        repository_id: Primary key of the Repository record.
        diff: Raw git diff string to review.
        db: Async database session.

    Returns:
        A dict matching PRReviewResponse schema.  Result is NOT persisted.
    """
    settings = get_settings()
    openai_client = get_openai_client()

    # ------------------------------------------------------------------
    # Load repository metadata for context
    # ------------------------------------------------------------------
    result = await db.execute(select(Repository).where(Repository.id == repository_id))
    repo = result.scalar_one_or_none()
    if repo is None:
        raise ValueError(f"Repository {repository_id} not found.")

    # ------------------------------------------------------------------
    # Extract context from summary and architecture JSON
    # ------------------------------------------------------------------
    summary = repo.summary_json or {}
    arch = repo.architecture_json or {}

    project_overview_ctx = summary.get("project_purpose", "Not available.")
    architecture_summary_ctx = arch.get("architecture_summary", "Not available.")
    tech_stack_breakdown = arch.get("tech_stack_breakdown", {})
    tech_stack_str = "\n".join(
        f"  {k}: {v}" for k, v in tech_stack_breakdown.items()
    ) if tech_stack_breakdown else "Not available."

    # ------------------------------------------------------------------
    # Build prompt
    # ------------------------------------------------------------------
    prompt = _PR_REVIEW_PROMPT_TEMPLATE.format(
        owner=repo.owner,
        name=repo.name,
        languages=", ".join(repo.primary_languages) if repo.primary_languages else "Unknown",
        frameworks=", ".join(repo.detected_frameworks) if repo.detected_frameworks else "Unknown",
        databases=", ".join(repo.detected_databases) if repo.detected_databases else "Unknown",
        project_overview=project_overview_ctx,
        architecture_summary=architecture_summary_ctx,
        tech_stack=tech_stack_str,
        diff=diff,
    )

    # ------------------------------------------------------------------
    # Call GPT-4o with JSON mode
    # ------------------------------------------------------------------
    logger.info(
        "Analyzing PR for repository %d (%s/%s) — diff length: %d chars",
        repository_id,
        repo.owner,
        repo.name,
        len(diff),
    )

    response = await openai_client.chat.completions.create(
        model=settings.chat_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior software engineer conducting a code review. "
                    "You always respond with valid JSON only, no markdown fences."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    raw_json = response.choices[0].message.content or "{}"

    try:
        review_data = json.loads(raw_json)

        # Validate and sanitize key fields
        if not isinstance(review_data.get("overall_score"), int):
            review_data["overall_score"] = int(review_data.get("overall_score", 50))

        if not isinstance(review_data.get("maintainability_score"), int):
            review_data["maintainability_score"] = int(
                review_data.get("maintainability_score", 50)
            )

        # Clamp scores to [0, 100]
        review_data["overall_score"] = max(0, min(100, review_data["overall_score"]))
        review_data["maintainability_score"] = max(
            0, min(100, review_data["maintainability_score"])
        )

        # Enforce valid approval recommendation
        if review_data.get("approval_recommendation") not in _VALID_RECOMMENDATIONS:
            review_data["approval_recommendation"] = "Request Changes"

    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.error("Failed to parse PR review JSON: %s | raw=%s", exc, raw_json[:500])
        return dict(_FALLBACK_REVIEW)

    logger.info(
        "PR review complete for repository %d — score: %d, recommendation: %s",
        repository_id,
        review_data.get("overall_score", 0),
        review_data.get("approval_recommendation", "N/A"),
    )
    return review_data
