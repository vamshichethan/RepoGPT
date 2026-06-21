"""
interview.py
~~~~~~~~~~~~
Pydantic schemas for Feature 10 – Interview Mode.
"""

from typing import Any

from pydantic import BaseModel


class InterviewQuestion(BaseModel):
    question: str
    hint: str  # brief talking point


class DesignDecision(BaseModel):
    decision: str
    rationale: str
    tradeoffs: str


class ScalabilityItem(BaseModel):
    area: str  # e.g. "Database", "Cache", "API"
    current_state: str
    bottleneck: str
    recommendation: str
    expected_benefit: str


class TechStackItem(BaseModel):
    name: str
    version: str
    purpose: str


class InterviewReport(BaseModel):
    project_overview: str
    tech_stack: list[TechStackItem]
    interview_questions: dict[str, list[InterviewQuestion]]  # keys: beginner, intermediate, advanced
    design_decisions: list[DesignDecision]
    scalability_analysis: list[ScalabilityItem]
    suggested_improvements: list[str]
