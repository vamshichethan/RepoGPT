"""
productivity.py
~~~~~~~~~~~~~~~~
API endpoints for code graph productivity features:
  - /productivity/dependencies  (what does this file import?)
  - /productivity/impact        (what depends on this file?)
  - /productivity/flow          (path between two files)

Backed by the Neo4j-powered GraphService.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.productivity import (
    DependencyRequest, DependencyResponse,
    ImpactRequest, ImpactResponse,
    FlowRequest, FlowResponse
)
from app.services.graph_service import GraphService

router = APIRouter(prefix="/productivity", tags=["productivity"])


import logging

logger = logging.getLogger(__name__)


@router.post("/dependencies", response_model=DependencyResponse)
async def get_dependencies(
    request: DependencyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Return files and services that this file imports/depends on."""
    try:
        graph_svc = GraphService()
        deps = await graph_svc.get_dependencies(request.repo_id, request.file_path)
        return DependencyResponse(dependencies=deps)
    except Exception as exc:
        logger.warning("Dependencies query failed for repo %d: %s", request.repo_id, exc)
        return DependencyResponse(dependencies=[])


@router.post("/impact", response_model=ImpactResponse)
async def get_impact(
    request: ImpactRequest,
    db: AsyncSession = Depends(get_db),
):
    """Return what other files/functions would be impacted by changing this file."""
    try:
        graph_svc = GraphService()
        impact = await graph_svc.get_impact(request.repo_id, request.file_path)
        return ImpactResponse(impact=impact)
    except Exception as exc:
        logger.warning("Impact query failed for repo %d: %s", request.repo_id, exc)
        return ImpactResponse(impact=[])


@router.post("/flow", response_model=FlowResponse)
async def get_flow(
    request: FlowRequest,
    db: AsyncSession = Depends(get_db),
):
    """Trace the dependency path between two files in the knowledge graph."""
    try:
        graph_svc = GraphService()
        flows = await graph_svc.get_flow(
            request.repo_id, request.source_path, request.target_path
        )
        return FlowResponse(flows=flows)
    except Exception as exc:
        logger.warning("Flow query failed for repo %d: %s", request.repo_id, exc)
        return FlowResponse(flows=[])
