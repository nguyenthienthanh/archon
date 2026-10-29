> Framework reference: Python. Loaded on demand by the framework-expert bundle.

# Python Expert — Gotchas & Decisions

Use Context7 for FastAPI/Django/Flask docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  FastAPI vs Django vs Flask,"FastAPI: async APIs + auto-docs. Django: full-featured + ORM + admin. Flask: minimal/micro"
  Pydantic vs dataclass,"Pydantic for validation/serialization (API boundaries). dataclass for internal structs"
  SQLAlchemy vs Django ORM,"SQLAlchemy: standalone/FastAPI. Django ORM: Django projects only"
  sync vs async,"async for I/O-bound (HTTP/DB). sync for CPU-bound. Don't mix blocking calls in async"
```

## Gotchas

- Mutable default args: `def f(items=[])` shares list across calls — use `def f(items=None): items = items or []`
- `asyncio.run()` creates new event loop — can't nest. Use `await` inside existing async context
- FastAPI `Depends()`: new instance per request by default. Use `@lru_cache` for singletons
- Django N+1: use `select_related` (FK/OneToOne) and `prefetch_related` (M2M/reverse FK)
- `isinstance(x, int)` catches `bool` too — `bool` is subclass of `int`. Check `type(x) is int` if needed
- Type hints are NOT enforced at runtime — use Pydantic or `beartype` for runtime validation
- `dict.get('key')` returns `None` silently — use `dict['key']` when key must exist
- `requirements.txt` vs `pyproject.toml`: prefer pyproject.toml (PEP 621) for modern projects
- `with` statement for resource cleanup (files, DB connections) — never rely on `__del__`
