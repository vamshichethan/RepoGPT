from pydantic import BaseModel
from typing import List, Optional

class DependencyRequest(BaseModel):
    repo_id: int
    file_path: str

class DependencyResponse(BaseModel):
    dependencies: List[dict]

class ImpactRequest(BaseModel):
    repo_id: int
    file_path: str

class ImpactResponse(BaseModel):
    impact: List[dict]

class FlowRequest(BaseModel):
    repo_id: int
    source_path: str
    target_path: str

class FlowResponse(BaseModel):
    flows: List[dict]
