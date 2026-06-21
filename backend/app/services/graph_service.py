"""
graph_service.py
~~~~~~~~~~~~~~~~
Repository Knowledge Graph service backed by Neo4j.

Builds and queries a rich graph of code entities and relationships:

Node Types:
  File, Class, Function, Api, Table, Service

Relationship Types:
  IMPORTS, DEFINED_IN, CALLS, HANDLED_BY, READS, WRITES, CALLS_SERVICE, USES

Methods:
  build_graph_for_repo  — Full Neo4j graph construction from AST analysis
  get_dependencies      — What does this file import?
  get_impact            — What depends on this file?
  get_flow              — Natural language → Cypher path traversal
  get_knowledge_graph   — Full graph for visualization
  query_graph_for_context — Hybrid RAG: extract graph context for a question
  get_entity_counts     — Counts per node type for the Entity Stats bar
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from app.core.neo4j_client import get_neo4j_driver
from app.services.ast_service import AstService, ExtractedEntities

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lang(file_path: str) -> Optional[str]:
    """Infer language from file extension."""
    if file_path.endswith(".py"):
        return "python"
    if file_path.endswith((".ts", ".tsx")):
        return "typescript"
    if file_path.endswith((".js", ".jsx", ".mjs")):
        return "javascript"
    return None


# ---------------------------------------------------------------------------
# GraphService
# ---------------------------------------------------------------------------

class GraphService:
    """Neo4j-backed knowledge graph for a repository."""

    def __init__(self):
        self.ast_service = AstService()

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    async def build_graph_for_repo(
        self,
        repo_id: int,
        files_content: Dict[str, Tuple[bytes, str]],
    ) -> None:
        """
        Clears all existing graph nodes for repo_id and rebuilds from files.
        files_content: {file_path: (content_bytes, language)}
        """
        driver = get_neo4j_driver()

        # Step 1: Delete all nodes for this repo
        async with driver.session() as session:
            await session.run(
                "MATCH (n {repo_id: $repo_id}) DETACH DELETE n",
                repo_id=repo_id,
            )
            logger.info("Cleared existing graph for repo %d", repo_id)

        # Step 2: Extract entities from each file
        all_entities: List[ExtractedEntities] = []
        for file_path, (content, language) in files_content.items():
            lang = language or _lang(file_path)
            if lang:
                entities = self.ast_service.extract_entities(content, lang, file_path)
                all_entities.append(entities)

        # Step 3: Batch-create all nodes
        async with driver.session() as session:
            # File nodes
            file_data = [
                {"repo_id": repo_id, "path": e.file_path, "language": e.language}
                for e in all_entities
            ]
            if file_data:
                await session.run("""
                    UNWIND $files AS f
                    MERGE (n:File {repo_id: f.repo_id, path: f.path})
                    SET n.language = f.language
                """, files=file_data)

            # Class nodes + DEFINED_IN edges
            class_data = []
            for e in all_entities:
                for cls in e.classes:
                    class_data.append({
                        "repo_id": repo_id,
                        "name": cls.name,
                        "file_path": cls.file_path,
                        "methods": cls.methods,
                    })
            if class_data:
                await session.run("""
                    UNWIND $classes AS c
                    MERGE (cls:Class {repo_id: c.repo_id, name: c.name, file_path: c.file_path})
                    SET cls.methods = c.methods
                    WITH cls, c
                    MATCH (f:File {repo_id: c.repo_id, path: c.file_path})
                    MERGE (cls)-[:DEFINED_IN]->(f)
                """, classes=class_data)

            # Function nodes + DEFINED_IN edges
            func_data = []
            for e in all_entities:
                for fn in e.functions:
                    func_data.append({
                        "repo_id": repo_id,
                        "name": fn.name,
                        "file_path": fn.file_path,
                        "calls": fn.calls,
                    })
            if func_data:
                await session.run("""
                    UNWIND $funcs AS fn
                    MERGE (f:Function {repo_id: fn.repo_id, name: fn.name, file_path: fn.file_path})
                    SET f.calls = fn.calls
                    WITH f, fn
                    MATCH (file:File {repo_id: fn.repo_id, path: fn.file_path})
                    MERGE (f)-[:DEFINED_IN]->(file)
                """, funcs=func_data)

            # API route nodes + HANDLED_BY edges
            api_data = []
            for e in all_entities:
                for route in e.api_routes:
                    api_data.append({
                        "repo_id": repo_id,
                        "method": route.method,
                        "path": route.path,
                        "handler": route.handler,
                        "file_path": route.file_path,
                    })
            if api_data:
                await session.run("""
                    UNWIND $apis AS a
                    MERGE (api:Api {repo_id: a.repo_id, method: a.method, path: a.path})
                    SET api.file_path = a.file_path
                    WITH api, a
                    MATCH (fn:Function {repo_id: a.repo_id, name: a.handler, file_path: a.file_path})
                    MERGE (api)-[:HANDLED_BY]->(fn)
                """, apis=api_data)

            # Table nodes + READS/WRITES edges
            db_data = []
            for e in all_entities:
                for dba in e.db_accesses:
                    db_data.append({
                        "repo_id": repo_id,
                        "table": dba.table,
                        "access_type": dba.access_type,
                        "file_path": dba.file_path,
                    })
            if db_data:
                await session.run("""
                    UNWIND $accesses AS a
                    MERGE (t:Table {repo_id: a.repo_id, name: a.table})
                    WITH t, a
                    MATCH (file:File {repo_id: a.repo_id, path: a.file_path})
                    FOREACH (_ IN CASE WHEN a.access_type = 'read' THEN [1] ELSE [] END |
                        MERGE (file)-[:READS]->(t))
                    FOREACH (_ IN CASE WHEN a.access_type = 'write' THEN [1] ELSE [] END |
                        MERGE (file)-[:WRITES]->(t))
                """, accesses=db_data)

            # External Service nodes + CALLS_SERVICE edges
            svc_data = []
            for e in all_entities:
                for svc in e.external_services:
                    svc_data.append({
                        "repo_id": repo_id,
                        "service": svc,
                        "file_path": e.file_path,
                    })
            if svc_data:
                await session.run("""
                    UNWIND $svcs AS s
                    MERGE (svc:Service {repo_id: s.repo_id, name: s.service})
                    WITH svc, s
                    MATCH (file:File {repo_id: s.repo_id, path: s.file_path})
                    MERGE (file)-[:CALLS_SERVICE]->(svc)
                """, svcs=svc_data)

            # IMPORTS edges: match import module text to file paths
            import_data = []
            file_paths = list(files_content.keys())
            for e in all_entities:
                for imp in e.imports:
                    # Resolve module → file path heuristically
                    module = imp.module.lstrip("./").replace(".", "/")
                    resolved = None
                    for fp in file_paths:
                        if module in fp or fp.endswith(module + ".py") or fp.endswith(module + ".ts") or fp.endswith(module + "/index.ts") or fp.endswith(module + "/index.js"):
                            resolved = fp
                            break
                    if resolved and resolved != e.file_path:
                        import_data.append({
                            "repo_id": repo_id,
                            "source": e.file_path,
                            "target": resolved,
                        })
            if import_data:
                await session.run("""
                    UNWIND $imports AS i
                    MATCH (src:File {repo_id: i.repo_id, path: i.source})
                    MATCH (tgt:File {repo_id: i.repo_id, path: i.target})
                    MERGE (src)-[:IMPORTS]->(tgt)
                """, imports=import_data)

            # CALLS edges between Function nodes
            fn_calls_data = []
            for e in all_entities:
                for fn in e.functions:
                    for called in fn.calls:
                        fn_calls_data.append({
                            "repo_id": repo_id,
                            "caller_name": fn.name,
                            "caller_file": fn.file_path,
                            "callee_name": called,
                        })
            if fn_calls_data:
                await session.run("""
                    UNWIND $calls AS c
                    MATCH (caller:Function {repo_id: c.repo_id, name: c.caller_name, file_path: c.caller_file})
                    MATCH (callee:Function {repo_id: c.repo_id, name: c.callee_name})
                    MERGE (caller)-[:CALLS]->(callee)
                """, calls=fn_calls_data)

        logger.info(
            "Knowledge graph built for repo %d: %d files, %d function sets, %d API routes",
            repo_id,
            len(all_entities),
            sum(len(e.functions) for e in all_entities),
            sum(len(e.api_routes) for e in all_entities),
        )

    # ------------------------------------------------------------------
    # Query: Dependencies (what does this file import?)
    # ------------------------------------------------------------------

    async def get_dependencies(
        self, repo_id: int, file_path: str
    ) -> List[Dict[str, Any]]:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run("""
                MATCH (src:File {repo_id: $repo_id, path: $path})-[r:IMPORTS]->(tgt:File)
                RETURN tgt.path AS target, type(r) AS type
                UNION
                MATCH (src:File {repo_id: $repo_id, path: $path})-[r:CALLS_SERVICE]->(svc:Service)
                RETURN svc.name AS target, type(r) AS type
                UNION
                MATCH (fn:Function {repo_id: $repo_id, file_path: $path})-[r:CALLS]->(callee:Function)
                RETURN callee.name + ' (' + callee.file_path + ')' AS target, type(r) AS type
            """, repo_id=repo_id, path=file_path)
            records = await result.data()
            return [{"target": r["target"], "type": r["type"], "file_path": r.get("target")} for r in records]

    # ------------------------------------------------------------------
    # Query: Impact (what depends on this file?)
    # ------------------------------------------------------------------

    async def get_impact(
        self, repo_id: int, file_path: str
    ) -> List[Dict[str, Any]]:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run("""
                MATCH (importer:File {repo_id: $repo_id})-[:IMPORTS]->(tgt:File {path: $path, repo_id: $repo_id})
                RETURN importer.path AS source, 'IMPORTS' AS type
                UNION
                MATCH (fn:Function {repo_id: $repo_id})-[:CALLS]->(callee:Function {repo_id: $repo_id, file_path: $path})
                RETURN fn.name + ' (' + fn.file_path + ')' AS source, 'CALLS' AS type
            """, repo_id=repo_id, path=file_path)
            records = await result.data()
            return [{"source": r["source"], "type": r["type"], "file_path": r["source"]} for r in records]

    # ------------------------------------------------------------------
    # Query: Flow tracing (path between files)
    # ------------------------------------------------------------------

    async def get_flow(
        self, repo_id: int, source_path: str, target_path: str
    ) -> List[Dict[str, Any]]:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run("""
                MATCH path = shortestPath(
                    (src:File {repo_id: $repo_id, path: $source})-[*..8]-(tgt:File {repo_id: $repo_id, path: $target})
                )
                RETURN [node in nodes(path) | coalesce(node.path, node.name, '')] AS path_nodes,
                       [rel in relationships(path) | type(rel)] AS rel_types,
                       length(path) AS depth
                LIMIT 5
            """, repo_id=repo_id, source=source_path, target=target_path)
            records = await result.data()
            flows = []
            for r in records:
                node_names = r.get("path_nodes", [])
                rel_types = r.get("rel_types", [])
                # Interleave nodes and relations: A -[CALLS]-> B -[IMPORTS]-> C
                parts = []
                for i, name in enumerate(node_names):
                    parts.append(name or "?")
                    if i < len(rel_types):
                        parts.append(f"-[{rel_types[i]}]->")
                flows.append({
                    "path": " ".join(parts),
                    "depth": r.get("depth", len(node_names)),
                })
            return flows

    # ------------------------------------------------------------------
    # Query: Full knowledge graph for visualization
    # ------------------------------------------------------------------

    async def get_knowledge_graph(
        self, repo_id: int, max_nodes: int = 500
    ) -> Dict[str, Any]:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            # Nodes
            node_result = await session.run("""
                MATCH (n {repo_id: $repo_id})
                RETURN
                    elementId(n) AS id,
                    labels(n)[0] AS type,
                    coalesce(n.name, n.path, '') AS name,
                    coalesce(n.path, n.file_path, '') AS file_path
                LIMIT $max_nodes
            """, repo_id=repo_id, max_nodes=max_nodes)
            node_records = await node_result.data()

            # Edges
            edge_result = await session.run("""
                MATCH (a {repo_id: $repo_id})-[r]->(b {repo_id: $repo_id})
                RETURN
                    elementId(a) AS source,
                    elementId(b) AS target,
                    type(r) AS rel_type
                LIMIT $max_edges
            """, repo_id=repo_id, max_edges=max_nodes * 3)
            edge_records = await edge_result.data()

            # Entity counts
            counts_result = await session.run("""
                MATCH (n {repo_id: $repo_id})
                RETURN labels(n)[0] AS type, count(n) AS cnt
            """, repo_id=repo_id)
            counts_records = await counts_result.data()
            entity_counts = {r["type"]: r["cnt"] for r in counts_records if r["type"]}

        nodes = [
            {
                "id": r["id"],
                "type": (r["type"] or "File").lower(),
                "name": r["name"],
                "file_path": r["file_path"],
            }
            for r in node_records
        ]
        edges = [
            {
                "source": r["source"],
                "target": r["target"],
                "type": r["rel_type"],
            }
            for r in edge_records
        ]
        return {
            "nodes": nodes,
            "edges": edges,
            "entity_counts": entity_counts,
        }

    # ------------------------------------------------------------------
    # Query: Natural language graph context for hybrid RAG
    # ------------------------------------------------------------------

    async def query_graph_for_context(
        self, repo_id: int, question: str
    ) -> str:
        """
        Extract structured graph context relevant to a natural language question.
        Returns a formatted string to prepend to the LLM context.
        """
        driver = get_neo4j_driver()
        context_parts: List[str] = []

        # Extract keywords from question to find relevant nodes
        words = re.findall(r'\b[A-Za-z][a-zA-Z0-9_]{3,}\b', question)
        keywords = list(set(w.lower() for w in words))[:10]

        async with driver.session() as session:
            # Find relevant files / functions / classes matching keywords
            for kw in keywords[:5]:
                result = await session.run("""
                    MATCH (n {repo_id: $repo_id})
                    WHERE toLower(coalesce(n.name, n.path, '')) CONTAINS $kw
                    RETURN labels(n)[0] AS type, coalesce(n.name, n.path) AS name, coalesce(n.file_path, n.path, '') AS file
                    LIMIT 5
                """, repo_id=repo_id, kw=kw)
                records = await result.data()
                for r in records:
                    context_parts.append(f"  {r['type']}: {r['name']} (in {r['file']})")

            # Find CALLS chains for verbs in the question
            verbs = [w for w in words if len(w) > 4][:3]
            for verb in verbs:
                result = await session.run("""
                    MATCH (fn:Function {repo_id: $repo_id})
                    WHERE toLower(fn.name) CONTAINS $verb
                    OPTIONAL MATCH (fn)-[:CALLS]->(callee:Function)
                    OPTIONAL MATCH (caller:Function)-[:CALLS]->(fn)
                    RETURN fn.name AS func, fn.file_path AS file,
                           collect(DISTINCT callee.name)[..5] AS calls,
                           collect(DISTINCT caller.name)[..5] AS callers
                    LIMIT 3
                """, repo_id=repo_id, verb=verb.lower())
                records = await result.data()
                for r in records:
                    if r["func"]:
                        calls_str = ", ".join(r["calls"]) if r["calls"] else "none"
                        callers_str = ", ".join(r["callers"]) if r["callers"] else "none"
                        context_parts.append(
                            f"  Function {r['func']} (in {r['file']}): calls [{calls_str}], called by [{callers_str}]"
                        )

            # Find API routes matching question
            if any(w in question.lower() for w in ["api", "endpoint", "route", "request", "post", "get"]):
                result = await session.run("""
                    MATCH (api:Api {repo_id: $repo_id})-[:HANDLED_BY]->(fn:Function)
                    RETURN api.method AS method, api.path AS path, fn.name AS handler, api.file_path AS file
                    LIMIT 10
                """, repo_id=repo_id)
                records = await result.data()
                for r in records:
                    context_parts.append(
                        f"  API: {r['method']} {r['path']} → handled by {r['handler']} in {r['file']}"
                    )

        if not context_parts:
            return ""

        return (
            "=== Knowledge Graph Context ===\n"
            + "\n".join(context_parts)
            + "\n=== End Graph Context ===\n"
        )

    # ------------------------------------------------------------------
    # Query: Entity counts
    # ------------------------------------------------------------------

    async def get_entity_counts(self, repo_id: int) -> Dict[str, int]:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run("""
                MATCH (n {repo_id: $repo_id})
                RETURN labels(n)[0] AS type, count(n) AS cnt
            """, repo_id=repo_id)
            records = await result.data()
            return {r["type"].lower(): r["cnt"] for r in records if r["type"]}
