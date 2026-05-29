"""Shared fixtures for annoscope tests."""

from __future__ import annotations

import json

import pytest
from PIL import Image


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """Redirect DB_PATH to a temp file and reinitialize schema."""
    db = tmp_path / "test_state.sqlite"
    import app.config as cfg_mod
    import app.database as db_mod

    monkeypatch.setattr(cfg_mod, "DB_PATH", db)
    monkeypatch.setattr(db_mod, "DB_PATH", db)
    db_mod.init_db()
    return db


@pytest.fixture()
def dataset_dir(tmp_path):
    """Minimal YOLO dataset: 2 images, 1 label each."""
    images = tmp_path / "images"
    labels = tmp_path / "labels"
    images.mkdir()
    labels.mkdir()

    for name in ("img_001.jpg", "img_002.jpg"):
        Image.new("RGB", (100, 80)).save(images / name)

    (labels / "img_001.txt").write_text("0 0.5 0.5 0.4 0.3\n1 0.2 0.8 0.1 0.1\n")
    (labels / "img_002.txt").write_text("0 0.3 0.4 0.2 0.25\n")

    return {"images": images, "labels": labels, "root": tmp_path}


@pytest.fixture()
def dataset_dir_coco(dataset_dir):
    """Extends dataset_dir with a minimal COCO annotations file."""
    coco = {
        "images": [
            {"id": 1, "file_name": "img_001.jpg"},
            {"id": 2, "file_name": "img_002.jpg"},
        ],
        "annotations": [
            {"id": 10, "image_id": 1, "category_id": 0, "bbox": [10, 20, 30, 40]},
        ],
        "categories": [
            {"id": 0, "name": "ClassA"},
            {"id": 1, "name": "ClassB"},
        ],
    }
    coco_path = dataset_dir["root"] / "annotations.json"
    coco_path.write_text(json.dumps(coco))
    dataset_dir["coco"] = coco_path
    return dataset_dir


@pytest.fixture()
def test_client(tmp_db, dataset_dir, monkeypatch):
    """FastAPI TestClient with patched config and active_dataset."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import app.config as cfg_mod
    import app.state as state_mod
    from app.config import AppConfig, DatasetConfig

    # Absolute paths work because Path(PROJ_ROOT) / absolute_str = absolute_str
    ds_cfg = DatasetConfig(
        name="Test Dataset",
        slug="test_ds",
        images=str(dataset_dir["images"]),
        labels=str(dataset_dir["labels"]),
        classes={0: "ClassA", 1: "ClassB"},
    )
    fake_config = AppConfig(datasets=[ds_cfg])
    monkeypatch.setattr(cfg_mod, "config", fake_config)
    monkeypatch.setattr(state_mod, "config", fake_config)

    state_mod.active_dataset.__init__()
    state_mod.active_dataset.load("test_ds")

    from app.routes import router as app_router

    app = FastAPI()
    app.include_router(app_router)
    return TestClient(app)
