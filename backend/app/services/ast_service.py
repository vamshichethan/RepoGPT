"""
ast_service.py
~~~~~~~~~~~~~~
Enhanced AST analysis service.

Extracts fine-grained code entities from Python, TypeScript, and JavaScript
source files using Tree-sitter parsers:

  - ClassInfo      : class definitions with methods and base classes
  - FunctionInfo   : function definitions with outgoing call references
  - ImportInfo     : import statements with module + imported symbols
  - ApiRoute       : REST endpoint declarations (FastAPI / Express / NestJS decorators)
  - DbAccess       : database table read/write operations
  - External Service references : redis, stripe, sendgrid, boto3, etc.

Returns an ExtractedEntities dataclass for each source file.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple

import tree_sitter
import tree_sitter_python
import tree_sitter_typescript
import tree_sitter_javascript

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ClassInfo:
    name: str
    file_path: str
    methods: List[str] = field(default_factory=list)
    base_classes: List[str] = field(default_factory=list)


@dataclass
class FunctionInfo:
    name: str
    file_path: str
    calls: List[str] = field(default_factory=list)  # names of functions this one calls


@dataclass
class ImportInfo:
    module: str
    symbols: List[str] = field(default_factory=list)


@dataclass
class ApiRoute:
    method: str   # GET, POST, PUT, DELETE, PATCH
    path: str
    handler: str  # function / method name
    file_path: str


@dataclass
class DbAccess:
    table: str
    access_type: str  # "read" | "write"
    file_path: str


@dataclass
class ExtractedEntities:
    file_path: str
    language: str
    classes: List[ClassInfo] = field(default_factory=list)
    functions: List[FunctionInfo] = field(default_factory=list)
    imports: List[ImportInfo] = field(default_factory=list)
    api_routes: List[ApiRoute] = field(default_factory=list)
    db_accesses: List[DbAccess] = field(default_factory=list)
    external_services: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Heuristics: external services
# ---------------------------------------------------------------------------

_EXTERNAL_SERVICE_PATTERNS = {
    "stripe": ["stripe"],
    "redis": ["redis", "aioredis", "ioredis", "redis-py"],
    "sendgrid": ["sendgrid", "@sendgrid"],
    "aws_s3": ["boto3", "botocore", "aws-sdk", "@aws-sdk"],
    "twilio": ["twilio"],
    "openai": ["openai"],
    "firebase": ["firebase", "firebase-admin"],
    "elasticsearch": ["elasticsearch", "elastic"],
    "mongodb": ["pymongo", "mongoengine", "mongoose"],
    "celery": ["celery"],
    "rabbitmq": ["pika", "aio-pika", "amqplib"],
    "kafka": ["kafka", "confluent-kafka"],
    "mailgun": ["mailgun"],
    "algolia": ["algoliasearch", "algoliasearch-client"],
    "pusher": ["pusher"],
    "cloudinary": ["cloudinary"],
}

_HTTP_METHOD_MAP = {
    "get": "GET", "post": "POST", "put": "PUT",
    "delete": "DELETE", "patch": "PATCH",
    # FastAPI / Flask aliases
    "route": "GET",
}

# SQLAlchemy / Prisma / TypeORM table/model patterns
_WRITE_PATTERNS = re.compile(
    r"\b(add|insert|create|save|update|delete|remove|commit|bulk_insert|execute|merge)\b",
    re.IGNORECASE,
)
_READ_PATTERNS = re.compile(
    r"\b(query|select|find|get|fetch|filter|all|first|scalars|execute|search)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# AstService
# ---------------------------------------------------------------------------

class AstService:
    """Tree-sitter based multi-language AST entity extractor."""

    def __init__(self):
        self.python_lang = tree_sitter.Language(tree_sitter_python.language())
        self.ts_lang = tree_sitter.Language(tree_sitter_typescript.language_typescript())
        self.js_lang = tree_sitter.Language(tree_sitter_javascript.language())

        self.python_parser = tree_sitter.Parser(self.python_lang)
        self.ts_parser = tree_sitter.Parser(self.ts_lang)
        self.js_parser = tree_sitter.Parser(self.js_lang)

        # --- Python queries ---
        self.py_import_query = self.python_lang.query("""
            (import_statement name: (dotted_name) @module)
            (import_from_statement module_name: (dotted_name) @module)
        """)
        self.py_class_query = self.python_lang.query("""
            (class_definition
                name: (identifier) @class_name
                body: (block) @class_body)
        """)
        self.py_function_query = self.python_lang.query("""
            (function_definition name: (identifier) @func_name)
        """)
        self.py_call_query = self.python_lang.query("""
            (call function: (identifier) @call)
            (call function: (attribute attribute: (identifier) @call))
        """)
        self.py_decorator_query = self.python_lang.query("""
            (decorated_definition
                (decorator
                    (call
                        function: (attribute
                            object: (identifier) @router
                            attribute: (identifier) @method)
                        arguments: (argument_list
                            (string) @path)))
                definition: (function_definition name: (identifier) @handler))
        """)

        # --- TypeScript / JavaScript queries ---
        self.ts_import_query = self.ts_lang.query("""
            (import_statement source: (string) @module)
        """)
        self.ts_class_query = self.ts_lang.query("""
            (class_declaration name: (type_identifier) @class_name)
        """)
        self.ts_function_query = self.ts_lang.query("""
            (function_declaration name: (identifier) @func_name)
            (method_definition name: (property_identifier) @func_name)
            (arrow_function) @arrow
        """)
        self.ts_call_query = self.ts_lang.query("""
            (call_expression function: (identifier) @call)
            (call_expression function: (member_expression property: (property_identifier) @call))
        """)

    # ------------------------------------------------------------------
    # Public API: extract_entities
    # ------------------------------------------------------------------

    def extract_entities(self, content: bytes, language: str, file_path: str) -> ExtractedEntities:
        """Parse source content and return structured ExtractedEntities."""
        entities = ExtractedEntities(file_path=file_path, language=language)
        try:
            if language == "python":
                self._extract_python(content, file_path, entities)
            elif language in ("typescript", "javascript"):
                self._extract_ts_js(content, language, file_path, entities)
        except Exception as exc:
            logger.warning("AST extraction failed for %s (%s): %s", file_path, language, exc)
        return entities

    # ------------------------------------------------------------------
    # Legacy API kept for backward compatibility
    # ------------------------------------------------------------------

    def extract_imports_and_calls(
        self, content: bytes, language: str
    ) -> Tuple[List[str], List[str]]:
        """Legacy shim — returns (imports, calls) as flat string lists."""
        entities = self.extract_entities(content, language, "<unknown>")
        imports = [imp.module for imp in entities.imports]
        calls: Set[str] = set()
        for fn in entities.functions:
            calls.update(fn.calls)
        return imports, list(calls)

    # ------------------------------------------------------------------
    # Python extraction
    # ------------------------------------------------------------------

    def _extract_python(self, content: bytes, file_path: str, entities: ExtractedEntities) -> None:
        tree = self.python_parser.parse(content)
        root = tree.root_node
        text = content.decode("utf-8", errors="replace")

        # Imports
        self._extract_py_imports(root, entities)

        # Classes
        self._extract_py_classes(root, file_path, entities, content)

        # Functions + calls (top-level)
        self._extract_py_functions(root, file_path, entities, content)

        # API routes (FastAPI / Flask)
        self._extract_py_routes(root, file_path, entities, content)

        # External services via import names
        self._detect_external_services([imp.module for imp in entities.imports], entities)

        # DB access heuristics
        self._detect_db_access_python(text, file_path, entities)

    def _extract_py_imports(self, root, entities: ExtractedEntities) -> None:
        matches = self.py_import_query.matches(root)
        for _, capture in matches:
            module_nodes = capture.get("module", [])
            if not isinstance(module_nodes, list):
                module_nodes = [module_nodes]
            for node in module_nodes:
                module_text = node.text.decode("utf-8") if node.text else ""
                if module_text:
                    imp = ImportInfo(module=module_text)
                    entities.imports.append(imp)

    def _extract_py_classes(self, root, file_path: str, entities: ExtractedEntities, content: bytes) -> None:
        matches = self.py_class_query.matches(root)
        for _, capture in matches:
            name_nodes = capture.get("class_name", [])
            if not isinstance(name_nodes, list):
                name_nodes = [name_nodes]
            for node in name_nodes:
                class_name = node.text.decode("utf-8") if node.text else ""
                if not class_name:
                    continue
                ci = ClassInfo(name=class_name, file_path=file_path)
                # Find methods inside class body
                body_nodes = capture.get("class_body", [])
                if not isinstance(body_nodes, list):
                    body_nodes = [body_nodes]
                for body in body_nodes:
                    method_matches = self.py_function_query.matches(body)
                    for _, mc in method_matches:
                        mn_list = mc.get("func_name", [])
                        if not isinstance(mn_list, list):
                            mn_list = [mn_list]
                        for mn in mn_list:
                            m_name = mn.text.decode("utf-8") if mn.text else ""
                            if m_name and m_name not in ("__init__",):
                                ci.methods.append(m_name)
                entities.classes.append(ci)

    def _extract_py_functions(self, root, file_path: str, entities: ExtractedEntities, content: bytes) -> None:
        matches = self.py_function_query.matches(root)
        seen_funcs: Set[str] = set()
        for _, capture in matches:
            fn_nodes = capture.get("func_name", [])
            if not isinstance(fn_nodes, list):
                fn_nodes = [fn_nodes]
            for node in fn_nodes:
                fn_name = node.text.decode("utf-8") if node.text else ""
                if fn_name and fn_name not in seen_funcs:
                    seen_funcs.add(fn_name)
                    # Find calls inside this function's parent node
                    fn_node = node.parent
                    calls: List[str] = []
                    if fn_node:
                        call_matches = self.py_call_query.matches(fn_node)
                        for _, cc in call_matches:
                            cn_list = cc.get("call", [])
                            if not isinstance(cn_list, list):
                                cn_list = [cn_list]
                            for cn in cn_list:
                                c_name = cn.text.decode("utf-8") if cn.text else ""
                                if c_name and c_name != fn_name:
                                    calls.append(c_name)
                    entities.functions.append(FunctionInfo(
                        name=fn_name,
                        file_path=file_path,
                        calls=list(set(calls)),
                    ))

    def _extract_py_routes(self, root, file_path: str, entities: ExtractedEntities, content: bytes) -> None:
        """Detect FastAPI / Flask route decorators."""
        matches = self.py_decorator_query.matches(root)
        for _, capture in matches:
            method_nodes = capture.get("method", [])
            path_nodes = capture.get("path", [])
            handler_nodes = capture.get("handler", [])

            method_list = method_nodes if isinstance(method_nodes, list) else [method_nodes]
            path_list = path_nodes if isinstance(path_nodes, list) else [path_nodes]
            handler_list = handler_nodes if isinstance(handler_nodes, list) else [handler_nodes]

            for m_node, p_node, h_node in zip(method_list, path_list, handler_list):
                method_raw = (m_node.text or b"").decode("utf-8").lower()
                http_method = _HTTP_METHOD_MAP.get(method_raw, method_raw.upper())
                path_raw = (p_node.text or b"").decode("utf-8").strip("'\"/\"")
                handler_name = (h_node.text or b"").decode("utf-8")
                if path_raw and handler_name:
                    entities.api_routes.append(ApiRoute(
                        method=http_method,
                        path=path_raw,
                        handler=handler_name,
                        file_path=file_path,
                    ))

        # Fallback regex for decorators the tree-sitter query misses
        text = content.decode("utf-8", errors="replace")
        for m in re.finditer(
            r'@(?:router|app)\.(\w+)\s*\(\s*["\']([^"\']+)["\']',
            text
        ):
            method_raw = m.group(1).lower()
            http_method = _HTTP_METHOD_MAP.get(method_raw, method_raw.upper())
            path_raw = m.group(2)
            # Find the next function def after this decorator
            after = text[m.end():]
            fn_match = re.search(r'async def (\w+)|def (\w+)', after[:200])
            handler_name = ""
            if fn_match:
                handler_name = fn_match.group(1) or fn_match.group(2)
            entities.api_routes.append(ApiRoute(
                method=http_method,
                path=path_raw,
                handler=handler_name,
                file_path=file_path,
            ))

    def _detect_db_access_python(self, text: str, file_path: str, entities: ExtractedEntities) -> None:
        """Heuristic DB access detection from SQLAlchemy patterns."""
        # Detect model/table names from select(), query(), .filter(), db.add()
        for m in re.finditer(
            r'\b(?:select|query)\s*\(\s*(\w+)\s*\)',
            text
        ):
            table = m.group(1)
            if table and table[0].isupper():
                entities.db_accesses.append(DbAccess(
                    table=table,
                    access_type="read",
                    file_path=file_path,
                ))
        for m in re.finditer(
            r'\bdb\s*\.\s*(add|delete|merge)\s*\(\s*(\w+)',
            text
        ):
            table = m.group(2)
            if table and table[0].isupper():
                entities.db_accesses.append(DbAccess(
                    table=table,
                    access_type="write",
                    file_path=file_path,
                ))

    # ------------------------------------------------------------------
    # TypeScript / JavaScript extraction
    # ------------------------------------------------------------------

    def _extract_ts_js(self, content: bytes, language: str, file_path: str, entities: ExtractedEntities) -> None:
        parser = self.ts_parser if language == "typescript" else self.js_parser
        lang_obj = self.ts_lang if language == "typescript" else self.js_lang
        tree = parser.parse(content)
        root = tree.root_node
        text = content.decode("utf-8", errors="replace")

        # Imports
        matches = self.ts_import_query.matches(root)
        for _, capture in matches:
            mod_nodes = capture.get("module", [])
            if not isinstance(mod_nodes, list):
                mod_nodes = [mod_nodes]
            for node in mod_nodes:
                module_text = (node.text or b"").decode("utf-8").strip("'\"")
                if module_text:
                    entities.imports.append(ImportInfo(module=module_text))

        # Classes
        matches = self.ts_class_query.matches(root)
        for _, capture in matches:
            cn_nodes = capture.get("class_name", [])
            if not isinstance(cn_nodes, list):
                cn_nodes = [cn_nodes]
            for node in cn_nodes:
                class_name = (node.text or b"").decode("utf-8")
                if class_name:
                    entities.classes.append(ClassInfo(name=class_name, file_path=file_path))

        # Functions + calls
        matches = self.ts_function_query.matches(root)
        seen_funcs: Set[str] = set()
        for _, capture in matches:
            fn_nodes = capture.get("func_name", [])
            if not isinstance(fn_nodes, list):
                fn_nodes = [fn_nodes]
            for node in fn_nodes:
                fn_name = (node.text or b"").decode("utf-8")
                if fn_name and fn_name not in seen_funcs:
                    seen_funcs.add(fn_name)
                    fn_node = node.parent
                    calls: List[str] = []
                    if fn_node:
                        call_matches = self.ts_call_query.matches(fn_node)
                        for _, cc in call_matches:
                            cn_list = cc.get("call", [])
                            if not isinstance(cn_list, list):
                                cn_list = [cn_list]
                            for cn in cn_list:
                                c_name = (cn.text or b"").decode("utf-8")
                                if c_name and c_name != fn_name:
                                    calls.append(c_name)
                    entities.functions.append(FunctionInfo(
                        name=fn_name,
                        file_path=file_path,
                        calls=list(set(calls)),
                    ))

        # API routes — Express / NestJS decorators
        for m in re.finditer(
            r'(?:@(?:Get|Post|Put|Delete|Patch)\s*\(\s*["\']([^"\']*)["\']|'
            r'(?:router|app)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\'])',
            text
        ):
            if m.group(1) is not None:
                # NestJS decorator: @Get('/path')
                decorator = text[max(0, m.start()-50):m.start()]
                method_match = re.search(r'@(Get|Post|Put|Delete|Patch)', decorator + text[m.start():m.start()+10])
                method_raw = method_match.group(1).upper() if method_match else "GET"
                path_raw = m.group(1)
                after = text[m.end():]
                fn_match = re.search(r'(?:async\s+)?(\w+)\s*\(', after[:200])
                handler = fn_match.group(1) if fn_match else ""
                entities.api_routes.append(ApiRoute(
                    method=method_raw, path=path_raw,
                    handler=handler, file_path=file_path,
                ))
            elif m.group(2):
                method_raw = m.group(2).upper()
                path_raw = m.group(3)
                after = text[m.end():]
                fn_match = re.search(r'(?:async\s+)?\(?(?:\w+\s*,\s*)*(\w+)\)?\s*=>', after[:200])
                handler = fn_match.group(1) if fn_match else ""
                entities.api_routes.append(ApiRoute(
                    method=method_raw, path=path_raw,
                    handler=handler, file_path=file_path,
                ))

        # External services
        self._detect_external_services([imp.module for imp in entities.imports], entities)

        # DB access heuristics for TypeORM / Prisma
        self._detect_db_access_ts(text, file_path, entities)

    def _detect_db_access_ts(self, text: str, file_path: str, entities: ExtractedEntities) -> None:
        """Prisma / TypeORM heuristic detection."""
        # Prisma: prisma.user.findMany() → table "user"
        for m in re.finditer(
            r'\bprisma\s*\.\s*(\w+)\s*\.\s*(findMany|findFirst|findUnique|create|update|delete|upsert|count)',
            text
        ):
            table = m.group(1)
            op = m.group(2)
            access_type = "write" if op in ("create", "update", "delete", "upsert") else "read"
            entities.db_accesses.append(DbAccess(table=table, access_type=access_type, file_path=file_path))

        # TypeORM: repository.find(), repository.save(), etc.
        for m in re.finditer(
            r'(\w+)Repository\s*\.\s*(find|save|delete|update|insert|count)',
            text
        ):
            table = m.group(1)
            op = m.group(2)
            access_type = "write" if op in ("save", "delete", "update", "insert") else "read"
            entities.db_accesses.append(DbAccess(table=table, access_type=access_type, file_path=file_path))

    def _detect_external_services(self, import_modules: List[str], entities: ExtractedEntities) -> None:
        """Map import module names to known external service labels."""
        found: Set[str] = set()
        all_imports_lower = " ".join(import_modules).lower()
        for service_name, patterns in _EXTERNAL_SERVICE_PATTERNS.items():
            if any(pat in all_imports_lower for pat in patterns):
                found.add(service_name)
        entities.external_services = list(found)
