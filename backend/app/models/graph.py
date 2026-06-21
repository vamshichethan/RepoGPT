from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GraphNode(Base):
    """Represents a node in the Code Dependency Graph."""
    __tablename__ = "graph_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    
    # E.g. "file", "function", "class", "module"
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # E.g. "backend/app/services/ast_service.py" or "backend.app.services.ast_service.AstService"
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    
    # Optional file path if it's not a file itself
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GraphEdge(Base):
    """Represents an edge in the Code Dependency Graph."""
    __tablename__ = "graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    
    source_id: Mapped[int] = mapped_column(ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False)
    target_id: Mapped[int] = mapped_column(ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False)
    
    # E.g. "calls", "imports", "inherits"
    edge_type: Mapped[str] = mapped_column(String(50), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
