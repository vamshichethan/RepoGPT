"""
knowledge_graph.py
~~~~~~~~~~~~~~~~~~
API router for repository knowledge graph exploration.

Endpoints:
  GET  /api/repositories/{id}/graph           → Full graph (nodes + edges) for visualization
  POST /api/repositories/{id}/graph/search    → Natural language graph query
  GET  /api/repositories/{id}/graph/entities  → Entity counts by type
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.repository import Repository
from app.services.graph_service import GraphService

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class KnowledgeGraphNode(BaseModel):
    id: str
    type: str
    name: str
    file_path: Optional[str] = None


class KnowledgeGraphEdge(BaseModel):
    source: str
    target: str
    type: str


class KnowledgeGraphResponse(BaseModel):
    nodes: List[KnowledgeGraphNode]
    edges: List[KnowledgeGraphEdge]
    entity_counts: Dict[str, int]


class GraphSearchRequest(BaseModel):
    query: str


class GraphSearchResponse(BaseModel):
    context: str
    nodes: List[KnowledgeGraphNode]
    edges: List[KnowledgeGraphEdge]


class EntityCountsResponse(BaseModel):
    counts: Dict[str, int]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{id}/graph", response_model=KnowledgeGraphResponse)
async def get_knowledge_graph(
    id: int,
    max_nodes: int = 500,
    db: AsyncSession = Depends(get_db),
):
    """Return the full knowledge graph for a repository (nodes + edges + entity counts)."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        graph_svc = GraphService()
        graph_data = await graph_svc.get_knowledge_graph(id, max_nodes=max_nodes)
    except Exception as exc:
        logger.warning("Knowledge graph unavailable for repo %d: %s", id, exc)
        graph_data = {"nodes": [], "edges": [], "entity_counts": {}}

    return KnowledgeGraphResponse(
        nodes=[KnowledgeGraphNode(**n) for n in graph_data.get("nodes", [])],
        edges=[KnowledgeGraphEdge(**e) for e in graph_data.get("edges", [])],
        entity_counts=graph_data.get("entity_counts", {}),
    )


@router.post("/{id}/graph/search", response_model=GraphSearchResponse)
async def search_knowledge_graph(
    id: int,
    payload: GraphSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Query the knowledge graph with a natural language question.
    Returns structured graph context + a focused subgraph."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        graph_svc = GraphService()
        context = await graph_svc.query_graph_for_context(id, payload.query)
        # Return focused subgraph — limited traversal around query entities
        graph_data = await graph_svc.get_knowledge_graph(id, max_nodes=200)
    except Exception as exc:
        logger.warning("Graph search failed for repo %d: %s", id, exc)
        context = ""
        graph_data = {"nodes": [], "edges": []}

    return GraphSearchResponse(
        context=context,
        nodes=[KnowledgeGraphNode(**n) for n in graph_data.get("nodes", [])],
        edges=[KnowledgeGraphEdge(**e) for e in graph_data.get("edges", [])],
    )


@router.get("/{id}/graph/entities", response_model=EntityCountsResponse)
async def get_entity_counts(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Return entity counts per node type for the repository knowledge graph."""
    result = await db.execute(select(Repository).where(Repository.id == id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        graph_svc = GraphService()
        counts = await graph_svc.get_entity_counts(id)
    except Exception as exc:
        logger.warning("Entity counts unavailable for repo %d: %s", id, exc)
        counts = {}

    return EntityCountsResponse(counts=counts, total=sum(counts.values()))
