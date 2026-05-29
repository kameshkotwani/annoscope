"""Tests for config loading and Pydantic validation."""

from __future__ import annotations

import pytest
import yaml


def write_yaml(path, data):
    path.write_text(yaml.dump(data))
    return path


def test_load_minimal_valid_config(tmp_path):
    from app.config import load_config

    cfg_path = write_yaml(
        tmp_path / "datasets.yaml",
        {
            "datasets": [
                {
                    "name": "Test",
                    "slug": "test",
                    "images": "data/images",
                    "labels": "data/labels",
                    "classes": {0: "cat"},
                }
            ]
        },
    )
    cfg = load_config(cfg_path)
    assert len(cfg.datasets) == 1
    assert cfg.datasets[0].slug == "test"
    assert cfg.datasets[0].classes[0] == "cat"


def test_load_config_with_coco(tmp_path):
    from app.config import load_config

    cfg_path = write_yaml(
        tmp_path / "datasets.yaml",
        {
            "datasets": [
                {
                    "name": "Test",
                    "slug": "test",
                    "images": "data/images",
                    "labels": "data/labels",
                    "coco": "data/annotations.json",
                }
            ]
        },
    )
    cfg = load_config(cfg_path)
    assert cfg.datasets[0].coco == "data/annotations.json"


def test_load_config_coco_defaults_to_none(tmp_path):
    from app.config import load_config

    cfg_path = write_yaml(
        tmp_path / "datasets.yaml",
        {
            "datasets": [
                {
                    "name": "Test",
                    "slug": "test",
                    "images": "data/images",
                    "labels": "data/labels",
                }
            ]
        },
    )
    cfg = load_config(cfg_path)
    assert cfg.datasets[0].coco is None
    assert cfg.datasets[0].coco_path is None


def test_load_config_missing_required_field_raises(tmp_path):
    from pydantic import ValidationError

    from app.config import load_config

    cfg_path = write_yaml(
        tmp_path / "datasets.yaml",
        {
            "datasets": [
                {
                    "name": "Test",
                    # slug missing
                    "images": "data/images",
                    "labels": "data/labels",
                }
            ]
        },
    )
    with pytest.raises(ValidationError):
        load_config(cfg_path)


def test_load_config_missing_file_raises(tmp_path):
    from app.config import load_config

    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "nonexistent.yaml")


def test_load_multiple_datasets(tmp_path):
    from app.config import load_config

    cfg_path = write_yaml(
        tmp_path / "datasets.yaml",
        {
            "datasets": [
                {"name": "A", "slug": "a", "images": "ia", "labels": "la"},
                {"name": "B", "slug": "b", "images": "ib", "labels": "lb"},
            ]
        },
    )
    cfg = load_config(cfg_path)
    assert len(cfg.datasets) == 2
    assert cfg.datasets[1].slug == "b"
