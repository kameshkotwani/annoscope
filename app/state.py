from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Set

from app.config import IMAGE_EXTS, config
from app.database import get_seen


class ActiveDataset:
    def __init__(self):
        self.slug: str
        self.images_path: Path
        self.labels_path: Path
        self.class_names: Dict[int, str] = {}
        self.has_coco: bool = False
        self.all_images: List[str] = []
        self.seen: Set[str] = set()
        self.img_by_filename: Dict[str, Any] = {}
        self.ann_by_image_id: Dict[int, List[Any]] = {}
        self.coco_categories: Dict[int, str] = {}

    def load(self, slug: str) -> None:
        cfg = next((d for d in config.datasets if d.slug == slug), None)
        if cfg is None:
            raise ValueError(f"Unknown dataset: {slug}")

        images_dir = cfg.images_path
        labels_dir = cfg.labels_path
        coco_path = cfg.coco_path
        class_names = {int(k): v for k, v in cfg.classes.items()}

        if not images_dir.exists():
            raise FileNotFoundError(f"Images directory not found: {images_dir}")

        # ── COCO ───────────────────────────────────────────────────────────────────
        ann_by_image_id: Dict[int, List[Any]] = {}
        img_by_filename: Dict[str, Any] = {}
        coco_categories: Dict[int, str] = {}

        has_coco = bool(coco_path and coco_path.exists())
        if has_coco:
            import json

            try:
                coco = json.loads(coco_path.read_text())
                img_by_filename = {img["file_name"]: img for img in coco["images"]}
                for ann in coco["annotations"]:
                    ann_by_image_id.setdefault(ann["image_id"], []).append(ann)
                coco_categories = {cat["id"]: cat["name"] for cat in coco["categories"]}
            except (json.JSONDecodeError, KeyError) as e:
                raise ValueError(f"Invalid COCO file {coco_path.name}: {e}") from e

        # ── review state (SQLite) ──────────────────────────────────────────────────
        seen = get_seen(slug)

        # ── image list ─────────────────────────────────────────────────────────────
        def _sort_key(f: str) -> tuple[int, int | str]:
            stem = Path(f).stem
            if stem.isdigit():
                return (0, int(stem))
            return (1, f)

        all_images = sorted(
            (f.name for f in images_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS),
            key=_sort_key,
        )

        self.slug = slug
        self.images_path = images_dir
        self.labels_path = labels_dir
        self.class_names = class_names
        self.has_coco = has_coco
        self.all_images = all_images
        self.seen = seen
        self.img_by_filename = img_by_filename
        self.ann_by_image_id = ann_by_image_id
        self.coco_categories = coco_categories

    def get_initial_state(self) -> Dict[str, Any]:
        seen_indices = [i for i, f in enumerate(self.all_images) if f in self.seen]
        return {
            "slug": self.slug,
            "images": self.all_images,
            "seen": sorted(list(self.seen)),
            "last_seen_index": max(seen_indices) if seen_indices else 0,
            "classes": self.class_names,
        }


# Singleton instance
active_dataset = ActiveDataset()
