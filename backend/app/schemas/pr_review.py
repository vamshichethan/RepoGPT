"""
pr_review.py
~~~~~~~~~~~~
Pydantic schemas for Feature 12 – PR Review.
"""

from pydantic import BaseModel


class PRReviewRequest(BaseModel):
    diff: str  # raw git diff string


class BugReport(BaseModel):
    file: str
    line_hint: str  # e.g. "~line 42" or "function foo()"
    description: str
    severity: str  # Critical | High | Medium | Low


class SecurityIssue(BaseModel):
    file: str
    description: str
    severity: str
    recommendation: str


class CodeSmell(BaseModel):
    file: str
    description: str
    smell_type: str  # e.g. "Large Function", "Deep Nesting"
    suggestion: str


class ComplexityItem(BaseModel):
    file: str
    function_name: str
    previous_complexity: int
    new_complexity: int
    risk: str  # Low | Medium | High
    recommendation: str


class PRReviewResponse(BaseModel):
    overall_score: int  # 0-100
    summary: str
    bugs: list[BugReport]
    security_issues: list[SecurityIssue]
    code_smells: list[CodeSmell]
    complexity_analysis: list[ComplexityItem]
    maintainability_score: int  # 0-100
    approval_recommendation: str  # "Approve" | "Approve with Changes" | "Request Changes"
    testing_recommendations: list[str]
