from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from app.config import config
from app.state import active_dataset
from app.database import update_state, add_staged_edit, get_staged_edits, clear_staged_edits, remove_staged_edit
from app.schemas import EditAction

# EXIF orientation values where width and height are swapped vs raw pixel layout
_EXIF_SWAP = {5, 6, 7, 8}

def _image_info(path: Path) -> tuple[int, int, int]:
    """Return (display_width, display_height, exif_orientation).

    Dimensions are already corrected for EXIF rotation so callers can use them
    directly for coordinate math without knowing the orientation value.
    """
    try:
        with PILImage.open(path) as img:
            orientation = img.getexif().get(274, 1)  # tag 274 = Orientation
            w, h = img.size
            if orientation in _EXIF_SWAP:
                return h, w, orientation
            return w, h, orientation
    except Exception:
        return 0, 0, 1

router = APIRouter()

@router.get("/")
def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")

@router.get("/api/datasets")
def list_datasets():
    return [{"name": d.name, "slug": d.slug} for d in config.datasets]

@router.post("/api/switch/{slug}")
def switch_dataset(slug: str):
    if slug != active_dataset.slug:
        try:
            active_dataset.load(slug)
        except (ValueError, FileNotFoundError) as e:
            raise HTTPException(status_code=404, detail=str(e))
    return active_dataset.get_initial_state()

@router.get("/api/images")
def list_images():
    return active_dataset.get_initial_state()

@router.get("/api/annotations/{filename}")
def get_annotations(filename: str):
    if filename not in active_dataset.all_images:
        raise HTTPException(status_code=404, detail="Image not found")

    # ── YOLO (On-demand) ───────────────────────────────────────────────────
    yolo_boxes = []
    labels_dir = active_dataset.labels_path
    class_names = active_dataset.class_names
    yolo_path = labels_dir / f"{Path(filename).stem}.txt"

    yolo_warnings = []
    if yolo_path.exists():
        try:
            for idx, line in enumerate(yolo_path.read_text().splitlines()):
                parts = line.strip().split()
                if len(parts) == 5:
                    cid = int(parts[0])
                    cx, cy, w, h = map(float, parts[1:])
                    yolo_boxes.append(
                        {
                            "line_index": idx,
                            "class_id": cid,
                            "class_name": class_names.get(cid, str(cid)),
                            "cx": cx,
                            "cy": cy,
                            "w": w,
                            "h": h,
                        }
                    )
                elif parts:
                    yolo_warnings.append(f"line {idx}: malformed ({len(parts)} fields)")
        except Exception as e:
            yolo_warnings.append(f"failed to read label file: {e}")

    # ── Image dims (always from PIL — EXIF-corrected) ──────────────────────
    image_path = active_dataset.images_path / filename
    iw, ih, exif_orientation = _image_info(image_path)

    # ── COCO (In-memory index) ─────────────────────────────────────────────
    coco_boxes = []
    img_meta = active_dataset.img_by_filename.get(filename)
    image_id = img_meta["id"] if img_meta else None

    if image_id is not None:
        coco_categories = active_dataset.coco_categories
        for ann in active_dataset.ann_by_image_id.get(image_id, []):
            cat_id = ann["category_id"]
            x, y, bw, bh = ann["bbox"]
            coco_boxes.append(
                {
                    "ann_id": ann["id"],
                    "category_id": cat_id,
                    "class_name": coco_categories.get(cat_id, str(cat_id)),
                    "x": x,
                    "y": y,
                    "w": bw,
                    "h": bh,
                }
            )

    active_dataset.seen.add(filename)
    update_state(active_dataset.slug, filename, "seen", True)

    return {
        "filename": filename,
        "width": iw,
        "height": ih,
        "exif_orientation": exif_orientation,
        "has_coco_file": active_dataset.has_coco,
        "yolo": yolo_boxes,
        "yolo_warnings": yolo_warnings,
        "coco": coco_boxes,
        "edits": get_staged_edits(active_dataset.slug, filename),
    }

@router.post("/api/edit/{filename}")
def edit_annotation(filename: str, edit: EditAction):
    """action: 'add' | 'delete' | 'move'"""
    if filename not in active_dataset.all_images:
        raise HTTPException(status_code=404, detail="Image not found")
    
    add_staged_edit(active_dataset.slug, filename, edit.action, edit.data)
    return {"ok": True, "edits": get_staged_edits(active_dataset.slug, filename)}

@router.post("/api/edit/{filename}/clear")
def clear_edits(filename: str):
    clear_staged_edits(active_dataset.slug, filename)
    return {"ok": True, "edits": []}

@router.delete("/api/edit/{filename}/{edit_id}")
def delete_single_edit(filename: str, edit_id: int):
    remove_staged_edit(edit_id, active_dataset.slug, filename)
    return {"ok": True, "edits": get_staged_edits(active_dataset.slug, filename)}

