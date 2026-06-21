from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ChatSessionCreate(BaseModel):
    """Payload to create a new chat session for a repository."""
    repository_id: int


class ChatSessionResponse(BaseModel):
    """Chat session response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    repository_id: int
    title: str | None
    created_at: datetime
    updated_at: datetime


class MessageCreate(BaseModel):
    """Payload to send a new message in a chat session."""
    content: str


class ChatSource(BaseModel):
    """A source citation from the vector search results."""
    file_path: str
    chunk_index: int
    relevance_score: float


class MessageResponse(BaseModel):
    """A single message in a chat session."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    role: str
    content: str
    sources: list[Any] | None
    created_at: datetime
