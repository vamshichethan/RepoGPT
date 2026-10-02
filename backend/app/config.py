from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # OpenAI / Gemini
    openai_api_key: str = ""
    openai_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    # GitHub
    github_token: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://repogpt:repogpt@localhost:5432/repogpt"

    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""  # Required for Qdrant Cloud; leave empty for local

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""  # Required for Neo4j Aura; leave empty for local no-auth

    # Workspace
    workspace_dir: str = "./workspace"

    # Environment
    environment: str = "development"

    # CORS — comma-separated list of allowed origins ("*" for dev)
    cors_origins: str = "*"

    # Ingestion limits
    max_files: int = 50000
    max_repo_size_mb: int = 500

    # Model names
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    chat_model: str = "gpt-4o"
    summary_model: str = "gpt-4o"

    # Chunking
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Retrieval
    retrieval_top_k: int = 8


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()
