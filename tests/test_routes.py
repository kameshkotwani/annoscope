"""Integration tests for FastAPI routes."""

from __future__ import annotations

# ── /api/datasets ──────────────────────────────────────────────────────────────


def test_list_datasets(test_client):
    resp = test_client.get("/api/datasets")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == "test_ds"
    assert data[0]["name"] == "Test Dataset"


# ── /api/switch/{slug} ─────────────────────────────────────────────────────────


def test_switch_to_valid_dataset(test_client):
    resp = test_client.post("/api/switch/test_ds")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == "test_ds"
    assert "img_001.jpg" in data["images"]
    assert "img_002.jpg" in data["images"]


def test_switch_to_unknown_dataset_returns_404(test_client):
    resp = test_client.post("/api/switch/no_such_dataset")
    assert resp.status_code == 404


# ── /api/annotations/{filename} ───────────────────────────────────────────────


def test_get_annotations_yolo(test_client):
    resp = test_client.get("/api/annotations/img_001.jpg")
    assert resp.status_code == 200
    data = resp.json()

    assert data["filename"] == "img_001.jpg"
    assert data["width"] == 100
    assert data["height"] == 80
    assert len(data["yolo"]) == 2
    assert data["yolo"][0]["class_id"] == 0
    assert data["yolo"][0]["cx"] == 0.5
    assert data["yolo"][1]["class_id"] == 1
    assert data["yolo_warnings"] == []


def test_get_annotations_marks_seen(test_client):
    from app.state import active_dataset

    assert "img_001.jpg" not in active_dataset.seen
    test_client.get("/api/annotations/img_001.jpg")
    assert "img_001.jpg" in active_dataset.seen


def test_get_annotations_missing_image_returns_404(test_client):
    resp = test_client.get("/api/annotations/ghost.jpg")
    assert resp.status_code == 404


def test_get_annotations_applies_move_edits(test_client):
    test_client.post(
        "/api/edit/img_001.jpg",
        json={
            "action": "move",
            "data": {"source": "yolo", "line_index": 0, "cx": 0.9, "cy": 0.9, "w": 0.4, "h": 0.3},
        },
    )
    resp = test_client.get("/api/annotations/img_001.jpg")
    box = resp.json()["yolo"][0]
    assert box["cx"] == 0.9
    assert box["cy"] == 0.9


# ── /api/edit/{filename} POST ──────────────────────────────────────────────────


def test_edit_delete(test_client):
    resp = test_client.post(
        "/api/edit/img_001.jpg",
        json={"action": "delete", "data": {"source": "yolo", "line_index": 0}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert len(data["edits"]) == 1
    assert data["edits"][0]["action"] == "delete"


def test_edit_move(test_client):
    resp = test_client.post(
        "/api/edit/img_001.jpg",
        json={
            "action": "move",
            "data": {"source": "yolo", "line_index": 0, "cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.2},
        },
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_edit_add(test_client):
    resp = test_client.post(
        "/api/edit/img_001.jpg",
        json={
            "action": "add",
            "data": {
                "source": "yolo",
                "class_id": 1,
                "class_name": "ClassB",
                "cx": 0.3,
                "cy": 0.3,
                "w": 0.1,
                "h": 0.1,
            },
        },
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_edit_invalid_action_rejected(test_client):
    resp = test_client.post(
        "/api/edit/img_001.jpg",
        json={"action": "explode", "data": {}},
    )
    assert resp.status_code == 422


def test_edit_unknown_image_returns_404(test_client):
    resp = test_client.post(
        "/api/edit/ghost.jpg",
        json={"action": "delete", "data": {"source": "yolo", "line_index": 0}},
    )
    assert resp.status_code == 404


# ── /api/edit/{filename}/clear ─────────────────────────────────────────────────


def test_clear_edits(test_client):
    test_client.post(
        "/api/edit/img_001.jpg",
        json={"action": "delete", "data": {"source": "yolo", "line_index": 0}},
    )
    resp = test_client.post("/api/edit/img_001.jpg/clear")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["edits"] == []


# ── DELETE /api/edit/{filename}/{edit_id} ──────────────────────────────────────


def test_delete_single_edit(test_client):
    test_client.post(
        "/api/edit/img_001.jpg",
        json={"action": "delete", "data": {"source": "yolo", "line_index": 0}},
    )
    test_client.post(
        "/api/edit/img_001.jpg",
        json={"action": "delete", "data": {"source": "yolo", "line_index": 1}},
    )

    # Fetch current edits to get IDs
    get_resp = test_client.get("/api/annotations/img_001.jpg")
    edits = get_resp.json()["edits"]
    assert len(edits) == 2

    del_resp = test_client.delete(f"/api/edit/img_001.jpg/{edits[0]['id']}")
    assert del_resp.status_code == 200
    assert len(del_resp.json()["edits"]) == 1


# ── /api/images ────────────────────────────────────────────────────────────────


def test_list_images(test_client):
    resp = test_client.get("/api/images")
    assert resp.status_code == 200
    data = resp.json()
    assert "images" in data
    assert len(data["images"]) == 2
