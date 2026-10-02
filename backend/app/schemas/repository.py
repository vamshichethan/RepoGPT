from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, ConfigDict


# Maps status -> progress percent for the status endpoint
STATUS_PROGRESS: dict[str, int] = {
    "pending": 0,
    "cloning": 10,
    "scanning": 20,
    "chunking": 40,
    "embedding": 70,
    "summarizing": 85,
    "architecting": 95,
    "graph_building": 98,
    "ready": 100,
    "error": -1,
}


class RepositoryCreate(BaseModel):
    """Payload to add a new GitHub repository for ingestion."""

    github_url: str

    @field_validator("github_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        """Validate and normalize any GitHub URL to canonical form.

        Delegates to parse_github_url() which robustly handles:
          - https://github.com/owner/repo
          - https://github.com/owner/repo/tree/main/subdir
          - https://github.com/owner/repo?tab=readme-ov-file
          - github.com/owner/repo  (no scheme)
          - git@github.com:owner/repo.git  (SSH)
          - www.github.com/owner/repo
        """
        from app.services.git_service import parse_github_url

        v = v.strip()
        if not v:
            raise ValueError("github_url cannot be empty")

        try:
            owner, repo = parse_github_url(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

        # Return the canonical URL form
        return f"https://github.com/{owner}/{repo}"


class RepositoryResponse(BaseModel):
    """Full repository response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner: str
    github_url: str
    description: str | None
    status: str
    status_message: str | None
    primary_languages: list[Any]
    num_files: int | None
    total_loc: int | None
    detected_frameworks: list[Any]
    detected_databases: list[Any]
    detected_dependencies: dict[str, Any]
    summary_json: dict[str, Any] | None
    architecture_json: dict[str, Any] | None
    qdrant_collection: str | None
    created_at: datetime
    updated_at: datetime


class RepositoryListResponse(BaseModel):
    """Paginated list of repositories."""

    repositories: list[RepositoryResponse]
    total: int


class IngestionStatusResponse(BaseModel):
    """Lightweight status check response for polling ingestion progress."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    status_message: str | None
    progress_percent: int

    @classmethod
    def from_repository(cls, repo: Any) -> "IngestionStatusResponse":
        return cls(
            id=repo.id,
            status=repo.status,
            status_message=repo.status_message,
            progress_percent=STATUS_PROGRESS.get(repo.status, 0),
        )
