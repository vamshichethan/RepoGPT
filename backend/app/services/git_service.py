"""
git_service.py
~~~~~~~~~~~~~~
Utilities for cloning GitHub repositories, scanning files, and detecting
project metadata such as languages, frameworks, databases, and dependencies.
"""

import json
import logging
import os
import re
import urllib.parse
from collections import Counter
from dataclasses import dataclass, field

import git

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Directories to skip entirely during file scan
_SKIP_DIRS: frozenset[str] = frozenset(
    {
        "node_modules",
        ".git",
        "dist",
        "build",
        "target",
        "vendor",
        "__pycache__",
        ".next",
        "coverage",
        ".pytest_cache",
        "venv",
        ".venv",
        ".mypy_cache",
        ".tox",
        "eggs",
        ".eggs",
        "htmlcov",
        ".cache",
        "out",
        ".gradle",
        ".idea",
        ".vscode",
    }
)

# File extensions to treat as binary / non-readable
_BINARY_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".svg",
        ".ico",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".mp4",
        ".mp3",
        ".pdf",
        ".zip",
        ".tar",
        ".gz",
        ".bz2",
        ".xz",
        ".7z",
        ".rar",
        ".lock",
        ".bin",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".class",
        ".pyc",
        ".pyo",
        ".pyd",
        ".whl",
        ".jar",
        ".war",
        ".ear",
        ".DS_Store",
        ".min.js",
        ".min.css",
        ".map",
        ".snap",
    }
)

# Map of extension -> human-readable language name
_LANGUAGE_MAP: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "JavaScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".cs": "C#",
    ".rb": "Ruby",
    ".php": "PHP",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".scala": "Scala",
    ".r": "R",
    ".R": "R",
    ".sql": "SQL",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "SASS",
    ".less": "LESS",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".toml": "TOML",
    ".md": "Markdown",
    ".rst": "reStructuredText",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".dart": "Dart",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".hs": "Haskell",
    ".lua": "Lua",
    ".pl": "Perl",
    ".tf": "Terraform",
}

# Max file size to read (1 MB)
_MAX_FILE_SIZE_BYTES: int = 1024 * 1024


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class FileInfo:
    """Represents a scanned source file from a repository."""

    path: str                    # Relative path from repo root
    extension: str               # File extension including dot
    size_bytes: int
    content: str
    line_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.line_count = self.content.count("\n") + 1 if self.content else 0


# ---------------------------------------------------------------------------
# URL parsing
# ---------------------------------------------------------------------------


def parse_github_url(url: str) -> tuple[str, str]:
    """Parse a GitHub URL and return (owner, repo_name).

    Robustly handles all standard and edge-case formats:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - https://github.com/owner/repo/
    - https://github.com/owner/repo/tree/main/...
    - https://github.com/owner/repo?tab=readme-ov-file
    - https://github.com/owner/repo#readme
    - https://www.github.com/owner/repo
    - github.com/owner/repo
    - git@github.com:owner/repo.git

    Raises:
        ValueError: If the URL does not match a valid GitHub repository.
    """
    raw = (url or "").strip()
    if not raw:
        raise ValueError("GitHub URL cannot be empty.")

    # Strip fragments (#...) and query parameters (?...)
    raw = raw.split("#")[0].split("?")[0].strip()

    # Handle git SSH format: git@github.com:owner/repo.git
    if raw.startswith("git@github.com:"):
        path = raw[len("git@github.com:"):]
    else:
        # Prepend https:// if protocol is missing
        if not re.match(r"^[a-zA-Z]+://", raw):
            raw = "https://" + raw
        parsed = urllib.parse.urlparse(raw)
        hostname = (parsed.hostname or "").lower()
        if hostname not in ("github.com", "www.github.com"):
            raise ValueError(
                f"Invalid GitHub URL domain: {parsed.hostname!r}. Expected github.com"
            )
        path = parsed.path

    # Extract path segments (/owner/repo/...)
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise ValueError(
            f"Invalid GitHub repository URL: {url!r}. Expected format: https://github.com/owner/repo"
        )

    owner = parts[0]
    repo = parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]

    # Validate characters (alphanumeric, underscore, hyphen, dot)
    if not re.match(r"^[A-Za-z0-9_.-]+$", owner) or not re.match(r"^[A-Za-z0-9_.-]+$", repo):
        raise ValueError(
            f"Invalid repository or owner name in GitHub URL: {url!r}"
        )

    return owner, repo


def normalize_github_url(url: str) -> str:
    """Normalize any GitHub URL into canonical https://github.com/owner/repo format."""
    owner, repo = parse_github_url(url)
    return f"https://github.com/{owner}/{repo}"


# ---------------------------------------------------------------------------
# Cloning
# ---------------------------------------------------------------------------


def clone_repository(
    github_url: str,
    target_dir: str,
    github_token: str = "",
) -> None:
    """Clone a GitHub repository to *target_dir* using GitPython.

    If *github_token* is provided it is embedded in the clone URL so that
    private repositories can be accessed.

    Raises:
        git.GitCommandError: On clone failure.
    """
    clone_url = github_url
    if github_token:
        # Embed token: https://<token>@github.com/owner/repo
        clone_url = github_url.replace("https://", f"https://{github_token}@", 1)

    logger.info("Cloning %s -> %s", github_url, target_dir)
    git.Repo.clone_from(clone_url, target_dir, depth=1)
    logger.info("Clone complete: %s", target_dir)


# ---------------------------------------------------------------------------
# File scanning
# ---------------------------------------------------------------------------


def scan_files(
    repo_dir: str,
    max_files: int = 50000,
    max_size_mb: int = 500,
) -> list[FileInfo]:
    """Walk *repo_dir* and return a list of :class:`FileInfo` objects.

    Skips:
    - Ignored directories (node_modules, .git, dist, …)
    - Binary file extensions
    - Files larger than 1 MB
    - Non-UTF-8 files

    Args:
        repo_dir: Absolute path to the cloned repository root.
        max_files: Maximum number of files to scan before stopping.
        max_size_mb: Not used for per-file limit (that is 1 MB); reserved
                     for total-size budget enforcement if needed.

    Returns:
        List of FileInfo objects sorted by relative path.
    """
    files: list[FileInfo] = []

    for root, dirs, filenames in os.walk(repo_dir):
        # Prune ignored directories in-place so os.walk won't recurse into them
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]

        for filename in filenames:
            if len(files) >= max_files:
                logger.warning("Reached max_files=%d, stopping scan.", max_files)
                return files

            abs_path = os.path.join(root, filename)
            rel_path = os.path.relpath(abs_path, repo_dir)
            _, ext = os.path.splitext(filename)
            ext_lower = ext.lower()

            # Skip binary extensions
            if ext_lower in _BINARY_EXTENSIONS or ext in _BINARY_EXTENSIONS:
                continue

            # Skip files that are too large
            try:
                size = os.path.getsize(abs_path)
            except OSError:
                continue

            if size > _MAX_FILE_SIZE_BYTES:
                logger.debug("Skipping large file (%d bytes): %s", size, rel_path)
                continue

            # Read content
            try:
                with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
                    content = fh.read()
            except (OSError, PermissionError) as exc:
                logger.debug("Cannot read %s: %s", rel_path, exc)
                continue

            files.append(
                FileInfo(
                    path=rel_path,
                    extension=ext_lower or ext,
                    size_bytes=size,
                    content=content,
                )
            )

    files.sort(key=lambda f: f.path)
    logger.info("Scanned %d files in %s", len(files), repo_dir)
    return files


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------


def detect_languages(files: list[FileInfo]) -> list[str]:
    """Return the top programming languages detected in *files*.

    Languages are ranked by file count and the top 5 are returned.
    """
    counter: Counter[str] = Counter()
    for f in files:
        lang = _LANGUAGE_MAP.get(f.extension)
        if lang:
            counter[lang] += 1

    # Return languages ordered by frequency (most common first), top 5
    return [lang for lang, _ in counter.most_common(5)]


# ---------------------------------------------------------------------------
# Framework detection
# ---------------------------------------------------------------------------


def detect_frameworks(files: list[FileInfo]) -> list[str]:
    """Detect frameworks by inspecting manifest files."""
    frameworks: set[str] = set()
    file_map: dict[str, FileInfo] = {f.path: f for f in files}

    # ---- JavaScript / TypeScript (package.json) ----------------------------
    pkg_json_candidates = [p for p in file_map if os.path.basename(p) == "package.json"]
    for pkg_path in pkg_json_candidates:
        try:
            pkg = json.loads(file_map[pkg_path].content)
            deps: dict[str, str] = {}
            deps.update(pkg.get("dependencies", {}))
            deps.update(pkg.get("devDependencies", {}))

            dep_keys_lower = {k.lower() for k in deps}

            framework_checks = {
                "React": "react",
                "Next.js": "next",
                "Vue": "vue",
                "Angular": "@angular/core",
                "Express": "express",
                "Fastify": "fastify",
                "NestJS": "@nestjs/core",
                "Svelte": "svelte",
                "Nuxt": "nuxt",
                "Remix": "@remix-run/react",
                "Vite": "vite",
                "Gatsby": "gatsby",
                "Electron": "electron",
            }
            for name, key in framework_checks.items():
                if key.lower() in dep_keys_lower:
                    frameworks.add(name)
        except (json.JSONDecodeError, KeyError):
            pass

    # ---- Python (requirements.txt / setup.py / pyproject.toml) ------------
    py_manifests = ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"]
    py_content = ""
    for manifest in py_manifests:
        candidates = [p for p in file_map if os.path.basename(p) == manifest]
        for c in candidates:
            py_content += file_map[c].content.lower() + "\n"

    python_framework_checks = {
        "FastAPI": "fastapi",
        "Django": "django",
        "Flask": "flask",
        "SQLAlchemy": "sqlalchemy",
        "Celery": "celery",
        "Pydantic": "pydantic",
        "LangChain": "langchain",
        "Pytest": "pytest",
        "Alembic": "alembic",
        "Uvicorn": "uvicorn",
        "Starlette": "starlette",
        "Tornado": "tornado",
        "Aiohttp": "aiohttp",
    }
    for name, key in python_framework_checks.items():
        if key in py_content:
            frameworks.add(name)

    # ---- Java (pom.xml / build.gradle) ------------------------------------
    java_manifests = [
        p for p in file_map if os.path.basename(p) in ("pom.xml", "build.gradle", "build.gradle.kts")
    ]
    java_content = ""
    for jm in java_manifests:
        java_content += file_map[jm].content.lower() + "\n"

    java_framework_checks = {
        "Spring Boot": "spring-boot",
        "Spring": "springframework",
        "Hibernate": "hibernate",
        "Maven": "<maven",
        "Gradle": "gradle",
        "Micronaut": "micronaut",
        "Quarkus": "quarkus",
    }
    for name, key in java_framework_checks.items():
        if key in java_content:
            frameworks.add(name)

    # ---- Ruby (Gemfile) ---------------------------------------------------
    gemfile_candidates = [p for p in file_map if os.path.basename(p) == "Gemfile"]
    gem_content = ""
    for gc in gemfile_candidates:
        gem_content += file_map[gc].content.lower() + "\n"

    ruby_framework_checks = {
        "Ruby on Rails": "rails",
        "Sinatra": "sinatra",
        "RSpec": "rspec",
    }
    for name, key in ruby_framework_checks.items():
        if key in gem_content:
            frameworks.add(name)

    # ---- Go (go.mod) ------------------------------------------------------
    gomod_candidates = [p for p in file_map if os.path.basename(p) == "go.mod"]
    go_content = ""
    for gc in gomod_candidates:
        go_content += file_map[gc].content.lower() + "\n"

    go_framework_checks = {
        "Gin": "gin-gonic/gin",
        "Echo": "labstack/echo",
        "Fiber": "gofiber/fiber",
        "GORM": "gorm.io",
    }
    for name, key in go_framework_checks.items():
        if key in go_content:
            frameworks.add(name)

    return sorted(frameworks)


# ---------------------------------------------------------------------------
# Database detection
# ---------------------------------------------------------------------------


def detect_databases(files: list[FileInfo]) -> list[str]:
    """Detect databases by grepping file contents for known patterns."""
    databases: set[str] = set()

    db_patterns = {
        "PostgreSQL": re.compile(r"postgres|postgresql|pg\.connect|asyncpg|psycopg", re.IGNORECASE),
        "MySQL": re.compile(r"mysql|mariadb|pymysql|mysql2", re.IGNORECASE),
        "MongoDB": re.compile(r"mongodb|mongoose|motor|pymongo", re.IGNORECASE),
        "Redis": re.compile(r"redis|aioredis|ioredis|RedisClient", re.IGNORECASE),
        "SQLite": re.compile(r"sqlite|aiosqlite", re.IGNORECASE),
        "Elasticsearch": re.compile(r"elasticsearch|opensearch", re.IGNORECASE),
        "Cassandra": re.compile(r"cassandra|datastax", re.IGNORECASE),
        "DynamoDB": re.compile(r"dynamodb|boto3\.resource.*dynamo", re.IGNORECASE),
        "Qdrant": re.compile(r"qdrant", re.IGNORECASE),
        "Pinecone": re.compile(r"pinecone", re.IGNORECASE),
        "Weaviate": re.compile(r"weaviate", re.IGNORECASE),
        "Prisma": re.compile(r"prisma", re.IGNORECASE),
        "Supabase": re.compile(r"supabase", re.IGNORECASE),
    }

    for f in files:
        if not f.content:
            continue
        for db_name, pattern in db_patterns.items():
            if pattern.search(f.content):
                databases.add(db_name)

    return sorted(databases)


# ---------------------------------------------------------------------------
# Folder structure
# ---------------------------------------------------------------------------


def get_folder_structure(repo_dir: str, max_depth: int = 3) -> str:
    """Generate an ASCII tree of the repository folder structure.

    Args:
        repo_dir: Absolute path to the repository root.
        max_depth: Maximum depth to traverse (root = depth 0).

    Returns:
        Multi-line string representing the directory tree.
    """
    lines: list[str] = []
    repo_name = os.path.basename(repo_dir.rstrip("/"))
    lines.append(f"{repo_name}/")

    def _walk(directory: str, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(os.listdir(directory))
        except PermissionError:
            return

        # Filter out hidden dirs and ignored dirs at the listing level
        visible = [
            e for e in entries
            if not (e.startswith(".") and e not in {".env", ".github"})
            and e not in _SKIP_DIRS
        ]

        for idx, entry in enumerate(visible):
            is_last = idx == len(visible) - 1
            connector = "└── " if is_last else "├── "
            full_path = os.path.join(directory, entry)
            is_dir = os.path.isdir(full_path)
            lines.append(f"{prefix}{connector}{entry}{'/' if is_dir else ''}")

            if is_dir and depth < max_depth:
                extension = "    " if is_last else "│   "
                _walk(full_path, prefix + extension, depth + 1)

    _walk(repo_dir, "", 1)
    return "\n".join(lines)
