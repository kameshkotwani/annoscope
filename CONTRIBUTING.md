# Contributing to Annoscope

Thanks for your interest in contributing. Annoscope is a focused tool — local-first, no bloat, no magic — and contributions should stay true to that philosophy.

---

## Table of Contents

- [Philosophy](#philosophy)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [What We Want (and What We Don't)](#what-we-want-and-what-we-dont)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## Philosophy

Before contributing, understand what Annoscope is *not*:

- **Not a labelling platform.** CVAT and Label Studio exist for creation. Annoscope is for reviewing work already done.
- **Not a heavy stack.** No ORMs, no build pipeline, no framework bloat. Changes that add significant dependencies will not be merged.
- **Not network-dependent.** Zero external calls at runtime. Keep it that way.

If your contribution respects these constraints, you're in the right place.

---

## Getting Started

### Prerequisites

- Python 3.10+
- [`uv`](https://github.com/astral-sh/uv) — the project uses uv for environment and dependency management
- [`just`](https://github.com/casey/just) — task runner (optional but recommended)

### Setup

```bash
# Clone the repo
git clone https://github.com/kameshkotwani/annoscope.git
cd annoscope

# Install all dependencies (including dev)
uv sync

# Set up pre-commit hooks
uv run pre-commit install

# Copy and configure your local dataset config
cp datasets.yaml datasets.local.yaml
# Edit datasets.local.yaml with your actual dataset paths

# Run the app
just app
# or without just:
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open `http://localhost:8000` to verify everything works.

---

## Project Structure

```
annoscope/
├── app/
│   ├── main.py          # FastAPI app entrypoint, route registration
│   ├── static/          # Vanilla JS, CSS, HTML — no build step
│   └── ...              # Routers, models, db helpers
├── datasets.yaml        # Example dataset config (committed)
├── datasets.local.yaml  # Your local paths (gitignored)
├── justfile             # Task runner commands
├── pyproject.toml       # Project metadata, deps, ruff config
└── .pre-commit-config.yaml
```

**Backend** is Python/FastAPI. **Frontend** is plain Vanilla JS — no React, no bundler, no `node_modules`. Keep it that way unless there is an exceptionally strong reason to deviate.

---

## Development Workflow

### Branching

Branch off `master` with a descriptive name:

```
feat/drag-drop-box-move
fix/coco-bbox-rendering-offset
chore/update-ruff-config
```

Use `feat/`, `fix/`, `chore/`, or `docs/` prefixes.

### Running Tasks

```bash
just --list        # See all available tasks
just app           # Start the dev server
```

### Linting

Ruff is configured in `pyproject.toml` with `E`, `F`, and `I` rules (errors, pyflakes, isort). It runs automatically via pre-commit, but you can also run it manually:

```bash
uv run ruff check .
uv run ruff format .
```

Pre-commit hooks will block commits that fail linting. Fix issues before pushing.

---

## Code Standards

### Python

- Target Python 3.10+. No walrus operators below 3.10, no `match` statements below 3.10 — but both are fair game.
- Use Pydantic v2 models for any config or structured data flowing through the app. Don't use raw dicts for things that have a defined shape.
- SQLite access via the `sqlite3` stdlib only — no SQLAlchemy, no Tortoise, no Peewee.
- Keep route handlers thin. Business logic belongs in helper modules, not in the FastAPI route function itself.
- Line length: 100 chars (enforced by ruff).

### JavaScript / Frontend

- Vanilla JS only. No npm, no bundler, no framework.
- State lives in JS module-level variables or `data-*` attributes — no localStorage, no IndexedDB unless there is a compelling reason.
- Keyboard shortcuts are a first-class feature. If you add a UI action, consider whether it should have a keybinding.
- Edit mode (the themed state for destructive actions) is load-bearing UX. Don't change its visual contract without a clear reason.

### General

- Don't touch source annotation files. All mutation goes through the SQLite staged-edit layer. This is a hard constraint.
- `datasets.local.yaml` is gitignored — never commit it or any file that contains real dataset paths.

---

## Testing

Tests use `pytest` and `httpx` (already in dev dependencies).

```bash
uv run pytest
```

For new FastAPI routes, add a test in the `tests/` directory that hits the endpoint via the `httpx` test client. For pure Python logic (annotation parsing, EXIF reading, etc.), plain unit tests are fine.

Tests do not need to cover the frontend JS, but if you introduce a parsing utility on the JS side that handles non-trivial logic, document it clearly.

---

## Submitting a Pull Request

1. Fork the repository and create your branch from `master`.
2. Make your changes. Keep commits focused — one logical change per commit.
3. Run linting and tests locally before pushing:
   ```bash
   uv run ruff check .
   uv run pytest
   ```
4. Open a PR against `master`. In the PR description, explain:
   - **What** the change does
   - **Why** it belongs in Annoscope (tie it to the philosophy above)
   - Any **caveats or known limitations**
5. If the PR addresses an open issue, link it: `Closes #42`.

PRs that are large, unfocused, or introduce heavy dependencies will be asked to scope down before review.

---

## What We Want (and What We Don't)

### Good contributions

- Items on the [roadmap](README.md#roadmap) — drag-drop box move, add box, list-view edit indicators, export with EXIF normalization, class visibility toggles
- Bug fixes with a reproduction case
- Performance improvements that don't add dependencies
- Better support for edge-case YOLO/COCO annotation formats
- Docs and README improvements

### Out of scope (please discuss first via an issue)

- Adding a database server (Postgres, MySQL, etc.)
- Adding a frontend framework (React, Vue, Svelte)
- Server-side rendering or templating engines beyond what FastAPI already ships
- Cloud storage integrations — this tool is explicitly local-first
- Authentication / multi-user support

If you have a use case that requires something out of scope, open an issue and explain it before building. Sometimes the right answer is a fork.

---

## Reporting Bugs

Open a GitHub Issue with:

- A clear, concise title
- Steps to reproduce
- Expected vs actual behaviour
- Your OS, Python version, and browser (for frontend bugs)
- A snippet of your `datasets.yaml` config (redact real paths if needed)
- Any relevant error output from the terminal or browser console

---

## Feature Requests

Open a GitHub Issue with the `enhancement` label. Describe the problem you're trying to solve, not just the solution you have in mind. If it aligns with the roadmap and philosophy, it's worth discussing.

---

## License

By contributing to Annoscope, you agree that your contributions will be licensed under the [MIT License](LICENSE).
