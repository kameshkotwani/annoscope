# Annotation Viewer — Status & Roadmap

Talking style: Caveman mode. Less words. more meaningful words.

Target: A lightweight, fast, local-first dataset audit and review tool.

## 🟢 Working (Completed)
- **Modular Architecture**: Backend split into `main`, `routes`, `state`, `database`, `schemas`, and `config`.
- **Dataset Agnostic**: No hard dependencies on specific projects. Works with any YOLO/COCO structure via `datasets.yaml`.
- **Pydantic Validation**: Configuration files are rigorously validated on startup.
- **SQLite Persistence**: All user actions (seen, flags, edits) are stored in `review_state.sqlite`.
- **Edit Mode**: 
    - Global UI theme transformation (Red theme when active).
    - Persistent selection logic using `line_index` (YOLO) and `ann_id` (COCO).
    - **Delete Box**: Optimistic UI removal and persistent SQLite storage.
    - **Restore Box**: Revert deletions by selecting "Ghost Boxes" in Edit Mode.
    - **Ghost Boxes**: Visual representation of deleted boxes with `✕` indicator.
    - **Clear All Edits**: One-click reset for the current image.

## 🟡 In Implementation (Active Development)
- **Staged Editing Phase 2**:
    - [x] Delete / Restore functionality.
    - [ ] Move Box (Drag & Drop).
    - [ ] Add Box (Click & Drag to draw new YOLO boxes).
- **UI Enhancements**:
    - [x] High-contrast Ghost Boxes.
    - [ ] List-view indicators for images with staged edits.

## 🔵 In Design (Planned Architecture)
- **Phase 3: Dataset Export & Normalization ("The Compile Step")**:
    - **Logic**: Generate a new, pristine dataset directory. Original data remains read-only.
    - **EXIF Sanitization**: Physically rotate pixel grids to match EXIF orientation and strip tags.
    - **Fast-Path Optimization**: Use file-system hardlinks or rapid copying for images without EXIF issues (handles 3000+ images in seconds).
    - **Native COCO Generation**: Export directly to COCO format from cleaned YOLO source.
- **Phase 4: Open Source Polish**:
    - Dockerization.
    - Class Visibility Toggles (Hide/Show specific categories).

## 🔴 Not Working / Known Limitations
- **Single-User State**: The backend uses a global `_active` state; not suitable for multiple simultaneous users on different datasets.
- **Source File Write-back**: There is currently no way to overwrite the original `.txt` files directly (this is an intentional safety feature, deferred to the Phase 3 Export).
- **YOLO-only Editing**: Staged edits are currently optimized for YOLO; COCO editing is limited to deletion.
