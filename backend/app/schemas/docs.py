"""
docs.py
~~~~~~~
Pydantic schemas for Feature 11 – Auto Documentation.
"""

from pydantic import BaseModel


class DocsResponse(BaseModel):
    readme: str           # Full README.md markdown
    architecture_doc: str  # ARCHITECTURE.md markdown
    api_docs: str         # API_DOCS.md markdown
    onboarding: str       # ONBOARDING.md markdown
