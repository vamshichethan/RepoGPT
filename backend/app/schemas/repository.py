import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, ConfigDict


_GITHUB_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?/?$"
)

# Maps status -> progress percent for the status endpoint
STATUS_PROGRESS: dict[str, int] = {
    "pending": 0,
    "cloning": 10,
    "scanning": 20,
    "chunking": 40,
    "embedding": 70,
    "summarizing": 85,
    "architecting": 95,
    "ready": 100,
    "error": -1,
}


class RepositoryCreate(BaseModel):
    """Payload to add a new GitHub repository for ingestion."""

    github_url: str

    @field_validator("github_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        v = v.strip()
        if not _GITHUB_URL_RE.match(v):
            raise ValueError(
                "github_url must be a valid GitHub repository URL "
                "(e.g. https://github.com/owner/repo)"
            )
        return v


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
