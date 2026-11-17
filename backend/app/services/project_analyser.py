
from collections import Counter
from pathlib import Path, PurePosixPath
import json
import zipfile


# Files we can inspect as text.
LANGUAGE_EXTENSIONS = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".cs": "C#",
    ".go": "Go",
    ".rs": "Rust",
    ".cpp": "C++",
    ".c": "C",
    ".html": "HTML",
    ".css": "CSS",
    ".sql": "SQL",
}

SKIP_DIRECTORIES = {
    "node_modules",
    ".git",
    ".next",
    "__pycache__",
    "dist",
    "build",
    ".venv",
    "venv",
    "coverage",
}

MAX_READ_BYTES = 64 * 1024
MAX_ANALYSIS_FILES = 100
MAX_TOTAL_TEXT_BYTES = 512 * 1024


def analyse_project(zip_path: Path) -> dict:
    """
    Inspect an uploaded ZIP without extracting or executing its contents.

    This produces a local analysis. AI interpretation will be added
    in the next step.
    """

    languages = Counter()
    frameworks = set()
    files = []
    sample_files = []
    total_text_bytes = 0

    with zipfile.ZipFile(zip_path) as archive:
        entries = archive.infolist()

        for entry in entries:
            if entry.is_dir():
                continue

            name = entry.filename.replace("\\", "/")
            path = PurePosixPath(name)

            if (
                name.startswith("/")
                or ".." in path.parts
                or ":" in name
                or any(
                    part.lower() in SKIP_DIRECTORIES
                    for part in path.parts
                )
            ):
                continue

            filename = path.name
            extension = Path(filename).suffix.lower()

            files.append(name)

            if extension in LANGUAGE_EXTENSIONS:
                languages[LANGUAGE_EXTENSIONS[extension]] += 1

            if len(sample_files) >= MAX_ANALYSIS_FILES:
                continue

            if entry.file_size > MAX_READ_BYTES:
                continue

            if extension not in LANGUAGE_EXTENSIONS and filename.lower() not in {
                "package.json",
                "requirements.txt",
                "pyproject.toml",
                "readme.md",
            }:
                continue

            if total_text_bytes + entry.file_size > MAX_TOTAL_TEXT_BYTES:
                continue

            try:
                with archive.open(entry) as source:
                    raw = source.read(MAX_READ_BYTES + 1)

                if len(raw) > MAX_READ_BYTES:
                    continue

                content = raw.decode("utf-8")
            except (UnicodeDecodeError, RuntimeError, OSError, ValueError):
                continue

            total_text_bytes += len(raw)

            lower_content = content.lower()

            if filename.lower() == "package.json":
                try:
                    package_data = json.loads(content)
                    dependencies = {
                        **package_data.get("dependencies", {}),
                        **package_data.get("devDependencies", {}),
                    }

                    if "react" in dependencies:
                        frameworks.add("React")
                    if "next" in dependencies:
                        frameworks.add("Next.js")
                    if "express" in dependencies:
                        frameworks.add("Express")
                    if "vue" in dependencies:
                        frameworks.add("Vue")
                except (json.JSONDecodeError, TypeError, AttributeError):
                    pass

            if extension == ".py":
                if "from fastapi import" in lower_content or "import fastapi" in lower_content:
                    frameworks.add("FastAPI")
                if "from django" in lower_content or "import django" in lower_content:
                    frameworks.add("Django")
                if "from flask import" in lower_content or "import flask" in lower_content:
                    frameworks.add("Flask")

            sample_files.append({
                "path": name,
                "content": content[:4000],
            })

    return {
        "total_files": len(files),
        "languages": dict(languages.most_common()),
        "frameworks": sorted(frameworks),
        "file_tree": files[:200],
        "sample_files": sample_files,
    }
