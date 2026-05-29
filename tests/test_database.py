"""Unit tests for app/database.py — SQLite operations."""

from __future__ import annotations

# ── add + get ──────────────────────────────────────────────────────────────────


def test_add_and_get_staged_edit(tmp_db):
    from app.database import add_staged_edit, get_staged_edits

    add_staged_edit("ds1", "img.jpg", "delete", {"source": "yolo", "line_index": 2})
    edits = get_staged_edits("ds1", "img.jpg")

    assert len(edits) == 1
    assert edits[0]["action"] == "delete"
    assert edits[0]["data"] == {"source": "yolo", "line_index": 2}
    assert "id" in edits[0]


def test_get_staged_edits_empty(tmp_db):
    from app.database import get_staged_edits

    assert get_staged_edits("ds1", "missing.jpg") == []


def test_get_staged_edits_isolated_by_slug_and_filename(tmp_db):
    from app.database import add_staged_edit, get_staged_edits

    add_staged_edit("ds1", "a.jpg", "delete", {"source": "yolo", "line_index": 0})
    add_staged_edit("ds2", "a.jpg", "delete", {"source": "yolo", "line_index": 1})
    add_staged_edit("ds1", "b.jpg", "delete", {"source": "yolo", "line_index": 2})

    assert len(get_staged_edits("ds1", "a.jpg")) == 1
    assert get_staged_edits("ds1", "a.jpg")[0]["data"]["line_index"] == 0


# ── move deduplication ─────────────────────────────────────────────────────────


def test_move_replaces_previous_move_for_same_line_index(tmp_db):
    from app.database import add_staged_edit, get_staged_edits

    add_staged_edit(
        "ds1",
        "img.jpg",
        "move",
        {"source": "yolo", "line_index": 0, "cx": 0.1, "cy": 0.1, "w": 0.2, "h": 0.2},
    )
    add_staged_edit(
        "ds1",
        "img.jpg",
        "move",
        {"source": "yolo", "line_index": 0, "cx": 0.9, "cy": 0.9, "w": 0.2, "h": 0.2},
    )

    edits = get_staged_edits("ds1", "img.jpg")
    assert len(edits) == 1
    assert edits[0]["data"]["cx"] == 0.9


def test_move_does_not_deduplicate_different_line_indices(tmp_db):
    from app.database import add_staged_edit, get_staged_edits

    add_staged_edit(
        "ds1",
        "img.jpg",
        "move",
        {"source": "yolo", "line_index": 0, "cx": 0.1, "cy": 0.1, "w": 0.2, "h": 0.2},
    )
    add_staged_edit(
        "ds1",
        "img.jpg",
        "move",
        {"source": "yolo", "line_index": 1, "cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.2},
    )

    assert len(get_staged_edits("ds1", "img.jpg")) == 2


# ── clear ──────────────────────────────────────────────────────────────────────


def test_clear_staged_edits(tmp_db):
    from app.database import add_staged_edit, clear_staged_edits, get_staged_edits

    add_staged_edit("ds1", "img.jpg", "delete", {"source": "yolo", "line_index": 0})
    add_staged_edit("ds1", "img.jpg", "delete", {"source": "yolo", "line_index": 1})
    clear_staged_edits("ds1", "img.jpg")

    assert get_staged_edits("ds1", "img.jpg") == []


def test_clear_only_affects_target_image(tmp_db):
    from app.database import add_staged_edit, clear_staged_edits, get_staged_edits

    add_staged_edit("ds1", "a.jpg", "delete", {"source": "yolo", "line_index": 0})
    add_staged_edit("ds1", "b.jpg", "delete", {"source": "yolo", "line_index": 0})
    clear_staged_edits("ds1", "a.jpg")

    assert get_staged_edits("ds1", "a.jpg") == []
    assert len(get_staged_edits("ds1", "b.jpg")) == 1


# ── remove single edit ─────────────────────────────────────────────────────────


def test_remove_staged_edit_by_id(tmp_db):
    from app.database import add_staged_edit, get_staged_edits, remove_staged_edit

    add_staged_edit("ds1", "img.jpg", "delete", {"source": "yolo", "line_index": 0})
    add_staged_edit("ds1", "img.jpg", "delete", {"source": "yolo", "line_index": 1})
    edits = get_staged_edits("ds1", "img.jpg")
    assert len(edits) == 2

    remove_staged_edit(edits[0]["id"], "ds1", "img.jpg")
    remaining = get_staged_edits("ds1", "img.jpg")
    assert len(remaining) == 1
    assert remaining[0]["data"]["line_index"] == 1


def test_remove_edit_wrong_slug_is_noop(tmp_db):
    from app.database import add_staged_edit, get_staged_edits, remove_staged_edit

    add_staged_edit("ds1", "img.jpg", "delete", {"source": "yolo", "line_index": 0})
    edit_id = get_staged_edits("ds1", "img.jpg")[0]["id"]

    remove_staged_edit(edit_id, "ds2", "img.jpg")  # wrong slug
    assert len(get_staged_edits("ds1", "img.jpg")) == 1


# ── seen ───────────────────────────────────────────────────────────────────────


def test_mark_seen(tmp_db):
    from app.database import get_seen, mark_seen

    mark_seen("ds1", "img.jpg")
    assert "img.jpg" in get_seen("ds1")


def test_mark_seen_idempotent(tmp_db):
    from app.database import get_seen, mark_seen

    mark_seen("ds1", "img.jpg")
    mark_seen("ds1", "img.jpg")  # no error, no duplicate
    assert len(get_seen("ds1")) == 1


def test_get_seen_isolated_by_slug(tmp_db):
    from app.database import get_seen, mark_seen

    mark_seen("ds1", "img.jpg")
    mark_seen("ds2", "other.jpg")
    assert get_seen("ds1") == {"img.jpg"}
    assert get_seen("ds2") == {"other.jpg"}
