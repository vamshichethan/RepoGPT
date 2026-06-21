from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Repository(Base):
    """Represents an ingested GitHub repository."""

    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner: Mapped[str] = mapped_column(String(255), nullable=False)
    github_url: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Ingestion lifecycle status
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    status_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Repository metadata (detected during ingestion)
    primary_languages: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    num_files: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_loc: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detected_frameworks: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    detected_databases: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    detected_dependencies: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Summary stored as JSON
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Architecture stored as JSON
    architecture_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Interview Mode report stored as JSON
    interview_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Auto-generated documentation files stored as JSON
    docs_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Qdrant collection name (e.g. "repo_1")
    qdrant_collection: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:
        return f"<Repository id={self.id} owner={self.owner} name={self.name} status={self.status}>"
