"""
chat.py
~~~~~~~
API endpoints for managing chat sessions and messages, including RAG-powered
streaming chat responses using Server-Sent Events (SSE).
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.repository import Repository
from app.schemas.chat import (
    ChatSessionCreate,
    ChatSessionResponse,
    MessageCreate,
    MessageResponse,
)
from app.services.chat_service import create_rag_response

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/repositories/{repo_id}/sessions", response_model=ChatSessionResponse)
async def create_chat_session(repo_id: int, db: AsyncSession = Depends(get_db)):
    """Create a new chat session for a repository."""
    # Verify repo exists
    repo_result = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    session = ChatSession(
        repository_id=repo_id,
        title=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/repositories/{repo_id}/sessions", response_model=list[ChatSessionResponse])
async def list_chat_sessions(repo_id: int, db: AsyncSession = Depends(get_db)):
    """List all chat sessions for a repository, ordered by updated time desc."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.repository_id == repo_id)
        .order_by(desc(ChatSession.updated_at))
    )
    return list(result.scalars().all())


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def list_session_messages(session_id: int, db: AsyncSession = Depends(get_db)):
    """Retrieve all messages in a session in chronological order."""
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    return list(result.scalars().all())


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: int,
    payload: MessageCreate,
):
    """Send a message to the assistant and get a streaming SSE response.

    Streams:
        data: {"content": "..."}
        data: {"done": true, "sources": [...]}
    """
    # Verify session exists (using a temp session)
    async with AsyncSessionLocal() as temp_db:
        session_result = await temp_db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")

    async def sse_generator():
        async with AsyncSessionLocal() as db:
            async for chunk in create_rag_response(session_id, payload.content, db):
                yield chunk

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
