from pydantic import BaseModel
from typing import Any


class ServiceDependency(BaseModel):
    """Represents a dependency connection between services."""
    service: str
    depends_on: str
    description: str


class ArchitectureResponse(BaseModel):
    """JSON response schema for repository architecture extraction."""
    architecture_summary: str
    mermaid_code: str
    service_dependencies: list[ServiceDependency]
    tech_stack_breakdown: dict[str, str]
    data_flow_description: str
