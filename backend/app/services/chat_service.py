"""
chat_service.py
~~~~~~~~~~~~~~~
Hybrid RAG chat service.

Retrieval pipeline:
  1. Embed user question → Qdrant semantic search (as before)
  2. Classify question type (relational vs. documentation)
  3. If relational → query Neo4j knowledge graph for structured context
  4. Merge Qdrant + Neo4j context → stream GPT-4o response via SSE
"""

import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.llm import get_openai_client
from app.core.qdrant_client import get_qdrant_client
from app.models.chat_session import ChatSession
from app.models.document_chunk import DocumentChunk
from app.models.message import Message
from app.models.repository import Repository

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hybrid retrieval: question type classifier
# ---------------------------------------------------------------------------

_RELATIONAL_KEYWORDS = {
    "calls", "calling", "called by", "imports", "imported", "depends",
    "dependency", "dependencies", "uses", "used by", "trace", "flow",
    "chain", "what breaks", "impact", "affects", "affected",
    "login flow", "checkout", "auth flow", "register", "signup",
    "routes to", "handled by", "which service", "which module",
    "how does", "sequence", "step by step", "follows",
}


def _is_relational_question(question: str) -> bool:
    """Return True if the question is about code relationships / flows."""
    q_lower = question.lower()
    return any(kw in q_lower for kw in _RELATIONAL_KEYWORDS)


# ---------------------------------------------------------------------------
# Main RAG function
# ---------------------------------------------------------------------------


async def create_rag_response(
    session_id: int,
    user_message_text: str,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Perform Hybrid RAG (Qdrant + Neo4j), stream the GPT-4o response, persist messages.

    Yields SSE-formatted JSON strings:
        data: {"content": "..."}
        data: {"done": true, "sources": [...]}
    """
    settings = get_settings()
    openai_client = get_openai_client()
    qdrant_client = get_qdrant_client()

    # 1. Fetch chat session + repository
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        yield f"data: {json.dumps({'error': 'Chat session not found'})}\n\n"
        return

    repo_result = await db.execute(select(Repository).where(Repository.id == session.repository_id))
    repo = repo_result.scalar_one_or_none()
    if not repo:
        yield f"data: {json.dumps({'error': 'Repository not found'})}\n\n"
        return

    # 2. Save user message
    user_msg = Message(
        session_id=session_id,
        role="user",
        content=user_message_text,
        sources=[],
        created_at=datetime.now(timezone.utc),
    )
    db.add(user_msg)
    await db.commit()

    # 3. Embed query
    query_vector = None
    try:
        kwargs = {}
        if settings.embedding_dim:
            kwargs["dimensions"] = settings.embedding_dim
        embed_response = await openai_client.embeddings.create(
            input=[user_message_text],
            model=settings.embedding_model,
            **kwargs,
        )
        query_vector = embed_response.data[0].embedding
    except Exception as exc:
        logger.warning("Embedding generation failed, falling back to database chunks: %s", exc)

    # 4. Qdrant vector search
    sources: list[dict[str, Any]] = []
    context_chunks: list[str] = []
    collection_name = repo.qdrant_collection or f"repo_{repo.id}"
    try:
        search_results = qdrant_client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=settings.retrieval_top_k,
        )
        for hit in search_results:
            payload = hit.payload or {}
            file_path = payload.get("file_path", "unknown")
            chunk_idx = payload.get("chunk_index", 0)
            content = payload.get("content", "")
            context_chunks.append(f"--- FILE: {file_path} (Chunk {chunk_idx}) ---\n{content}\n")
            sources.append({
                "file_path": file_path,
                "chunk_index": chunk_idx,
                "relevance_score": float(hit.score),
            })
    except Exception as exc:
        logger.exception("Qdrant search failed: %s", exc)

    if not context_chunks:
        fallback_result = await db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.repository_id == repo.id)
            .order_by(DocumentChunk.file_path, DocumentChunk.chunk_index)
            .limit(settings.retrieval_top_k)
        )
        fallback_chunks = list(fallback_result.scalars().all())
        for chunk in fallback_chunks:
            context_chunks.append(
                f"--- FILE: {chunk.file_path} (Chunk {chunk.chunk_index}) ---\n"
                f"{chunk.chunk_content}\n"
            )
            sources.append({
                "file_path": chunk.file_path,
                "chunk_index": chunk.chunk_index,
                "relevance_score": 0.0,
            })
        if fallback_chunks:
            logger.info(
                "Using %d PostgreSQL chunks as fallback chat context for repository %d.",
                len(fallback_chunks),
                repo.id,
            )

    # 5. Neo4j graph context (hybrid retrieval)
    graph_context_str = ""
    if _is_relational_question(user_message_text):
        try:
            from app.services.graph_service import GraphService
            graph_svc = GraphService()
            graph_context_str = await graph_svc.query_graph_for_context(
                repo.id, user_message_text
            )
            if graph_context_str:
                logger.info("Graph context retrieved (%d chars) for session %d", len(graph_context_str), session_id)
        except Exception as exc:
            logger.warning("Graph context retrieval failed (non-fatal): %s", exc)

    # 6. Fetch message history (last 10)
    history_result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .where(Message.id != user_msg.id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    history_msgs = list(history_result.scalars().all())
    history_msgs.reverse()

    # 7. Build OpenAI messages
    openai_messages = []

    system_prompt = (
        f"You are RepoGPT, a helpful AI code assistant for the {repo.owner}/{repo.name} repository.\n"
        "Your task is to answer user questions using the provided repository context.\n"
        "Follow these rules strictly:\n"
        "1. Answer based on the provided code/context. If the information is not in the context, say so clearly.\n"
        "2. ALWAYS cite file names (e.g. `src/auth/auth.service.ts`) when referencing code.\n"
        "3. Be specific about functions, classes, and variable names.\n"
        "4. Format code snippets in markdown code blocks.\n"
        "5. When graph context is provided, use it to trace function call chains and service relationships precisely."
    )
    openai_messages.append({"role": "system", "content": system_prompt})

    for msg in history_msgs:
        openai_messages.append({"role": msg.role, "content": msg.content})

    # Combine Qdrant + graph context
    context_str = "\n".join(context_chunks)
    context_prompt = f"Here is the relevant repository context:\n\n{context_str}\n"
    if graph_context_str:
        context_prompt += f"\n{graph_context_str}\n"
    context_prompt += f"\nUser Question: {user_message_text}"
    openai_messages.append({"role": "user", "content": context_prompt})

    # 8. Stream GPT-4o response
    assistant_content = ""
    try:
        stream = await openai_client.chat.completions.create(
            model=settings.chat_model,
            messages=openai_messages,
            stream=True,
            temperature=0.2,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                assistant_content += delta
                yield f"data: {json.dumps({'content': delta})}\n\n"
    except Exception as exc:
        logger.exception("OpenAI streaming failed: %s", exc)
        fallback_msg = (
            f"Based on the repository {repo.owner}/{repo.name} ({', '.join(repo.primary_languages or ['Code'])}): "
            f"The codebase contains {repo.num_files or 0} files totaling {repo.total_loc or 0} lines of code. "
            f"Regarding your query: I have analyzed the repository structure and context. What specific component or file would you like to explore?"
        )
        assistant_content = fallback_msg
        yield f"data: {json.dumps({'content': fallback_msg})}\n\n"

    # 9. Persist assistant message
    assistant_msg = Message(
        session_id=session_id,
        role="assistant",
        content=assistant_content,
        sources=sources,
        created_at=datetime.now(timezone.utc),
    )
    db.add(assistant_msg)

    if not session.title:
        session.title = user_message_text[:50] + ("..." if len(user_message_text) > 50 else "")
        session.updated_at = datetime.now(timezone.utc)

    await db.commit()

    # 10. Done signal
    yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"
