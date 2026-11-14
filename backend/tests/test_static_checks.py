"""Contrôles statiques qui ne demandent aucune dépendance lourde (FastAPI, SQLAlchemy, LangChain…).

Ils existent parce que les tests unitaires n'importent pas toute l'infrastructure : un import cassé
(ex. `from .config import settings` sans `settings` défini) ne serait vu qu'au démarrage du serveur."""
import ast
import builtins
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = sorted([*(ROOT / "app").rglob("*.py"), *(ROOT / "scripts").rglob("*.py")])


def _module_name(path: Path) -> str:
    parts = list(path.relative_to(ROOT).with_suffix("").parts)
    return ".".join(parts[:-1] if parts[-1] == "__init__" else parts)


def _toplevel_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            names.update(n.id for t in targets for n in ast.walk(t) if isinstance(n, ast.Name))
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update((a.asname or a.name).split(".")[0] for a in node.names)
    return names


MODULES = {_module_name(p): _toplevel_names(ast.parse(p.read_text(encoding="utf-8"))) for p in SOURCES}


def test_internal_imports_resolve():
    problems = []
    for path in SOURCES:
        package = _module_name(path).split(".")
        if path.name != "__init__.py":
            package = package[:-1]
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not isinstance(node, ast.ImportFrom):
                continue
            if node.level:
                base = package[:len(package) - (node.level - 1)]
                target = ".".join([*base, *([node.module] if node.module else [])])
            elif (node.module or "").split(".")[0] in ("app", "scripts"):
                target = node.module
            else:
                continue  # bibliothèque externe
            for alias in node.names:
                if target not in MODULES:
                    problems.append(f"{path.name}:{node.lineno} module inconnu {target}")
                elif alias.name != "*" and alias.name not in MODULES[target] and f"{target}.{alias.name}" not in MODULES:
                    problems.append(f"{path.name}:{node.lineno} {alias.name!r} n'existe pas dans {target}")
    assert not problems, "\n".join(problems)


def test_no_undefined_names():
    """Détection grossière (sans analyse de portée) : un nom lu mais défini nulle part dans le module."""
    problems = []
    known_builtins = set(dir(builtins)) | {"__file__", "__name__", "__doc__"}
    for path in SOURCES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        defined = set(known_builtins)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                defined.add(node.name)
            elif isinstance(node, ast.arg):
                defined.add(node.arg)
            elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
                defined.add(node.id)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                defined.update((a.asname or a.name).split(".")[0] for a in node.names)
            elif isinstance(node, ast.ExceptHandler) and node.name:
                defined.add(node.name)
            elif isinstance(node, (ast.Global, ast.Nonlocal)):
                defined.update(node.names)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id not in defined:
                problems.append(f"{path.name}:{node.lineno} nom indéfini : {node.id}")
    assert not problems, "\n".join(problems)


def test_domain_and_application_stay_pure():
    """Architecture : domain et application ne dépendent d'aucune bibliothèque technique."""
    forbidden = {"fastapi", "sqlalchemy", "langchain", "langchain_core", "langchain_openai", "langgraph",
                 "pgvector", "psycopg", "sentence_transformers", "reportlab", "jwt", "docx", "pypdf"}
    problems = []
    for path in SOURCES:
        rel = path.relative_to(ROOT).parts
        if rel[:2] not in (("app", "domain"), ("app", "application")):
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else \
                   [node.module or ""] if isinstance(node, ast.ImportFrom) and not node.level else []
            problems += [f"{path.name}:{node.lineno} importe {m}" for m in mods if m.split(".")[0] in forbidden]
            if isinstance(node, ast.ImportFrom) and node.level and (node.module or "").startswith(("infrastructure", "presentation")):
                problems.append(f"{path.name}:{node.lineno} dépend de {node.module}")
    assert not problems, "\n".join(problems)
