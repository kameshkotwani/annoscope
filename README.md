# Annoscope

<div align="center">
  <img src="app/static/icon-large.svg" alt="Annoscope" width="180"/>
</div>

[![Python](https://img.shields.io/badge/python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/SQLite-local--first-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![uv](https://img.shields.io/badge/uv-package%20manager-DE5FE9?logo=astral&logoColor=white)](https://github.com/astral-sh/uv)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![pre-commit](https://img.shields.io/badge/pre--commit-enabled-FAB040?logo=pre-commit&logoColor=white)](https://pre-commit.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/kameshkotwani/annoscope/blob/master/LICENSE)

A fast, local-first dataset audit and annotation review tool for computer vision projects.

## Screenshots

**Dataset Cleaner** — dual panel view: raw YOLO source (left) vs clean final (right), with seen/unseen tracking in the sidebar.
![Dataset Cleaner](screenshots/main-screen.png)

**Edit Mode** — red theme activates when edits are live. Deleted boxes become ghost outlines (✕) that can be restored by clicking.
![Edit Mode](screenshots/edit-mode.png)

**Format Comparison** — overlay YOLO and COCO annotations on the same image to spot alignment issues. Synthesizes COCO from YOLO when no `.json` file exists.
![Format Comparison](screenshots/yolo-coco-compare.png)

## The Problem

Standard annotation workflows have no good answer for the QA step. You either:
- Open images one-by-one in a file browser with no state tracking
- Spin up a heavy labelling platform (CVAT, Label Studio) just to *review* work that's already done
- Write throwaway scripts that show one image and immediately lose context

Annoscope fills that gap — purpose-built for reviewing and auditing existing YOLO/COCO datasets, not creating them from scratch.

## What It Does

- **Browse at speed** — keyboard-driven navigation through thousands of images with persistent seen/unseen tracking
- **Overlay annotations** — YOLO and COCO boxes rendered directly on images with class labels
- **Staged editing** — delete, restore, and move individual boxes per image; all edits stored in SQLite, originals never modified
- **Edit mode** — full UI theme switch signals when destructive actions are live; ghost boxes show deleted annotations for restore
- **Format comparison** — side-by-side YOLO vs COCO view with overlay toggle; synthesizes COCO from YOLO when no `.json` file exists
- **EXIF aware** — reads orientation metadata so images and bounding boxes render correctly regardless of camera source; warns when rotation is detected
- **Dataset agnostic** — point it at any YOLO/COCO directory structure via a single `datasets.yaml`; no project lock-in

## Why It's Fast

- Zero network calls — everything runs locally over `localhost`
- SQLite for state — no database server, no ORM overhead, instant reads
- Static file serving for images — FastAPI mounts image directories directly, no base64 encoding or proxying
- Hardlink-based export (planned) — copying 3000+ images takes seconds, not minutes

## Stack

- **Backend**: FastAPI + SQLite (via `sqlite3` stdlib)
- **Frontend**: Vanilla JS, Konva.js for canvas rendering — no build step, no framework
- **Config**: Pydantic-validated YAML
- **CLI**: Typer + Rich

## Setup

```bash
uv sync
cp datasets.yaml datasets.local.yaml   # edit paths for your machine
annoscope run
```

Or with custom host/port:

```bash
annoscope run --host 0.0.0.0 --port 9000
```

Open `http://localhost:8000`.

## Dataset Config

```yaml
datasets:
  - name: My Dataset
    slug: my_dataset
    images: path/to/images            # relative to project root
    labels: path/to/labels            # YOLO .txt files
    coco: path/to/annotations.json    # optional
    classes:
      0: Cat
      1: Dog
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` / `↓` | Next image |
| `←` / `↑` | Previous image |
| `E` | Toggle edit mode |
| `R` | Reset zoom/pan |
| `Delete` / `Backspace` | Delete selected box |
| `Escape` | Deselect |

## Roadmap

- [x] Delete / restore boxes (staged edits)
- [x] Move box (drag & drop)
- [ ] Add box (click & drag)
- [ ] Dataset export with EXIF normalization
- [ ] Class visibility toggles
- [ ] List-view indicators for images with edits
- [ ] Docker support
