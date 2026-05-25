from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel


class YoloBox(BaseModel):
    line_index: int
    class_id: int
    class_name: str
    cx: float
    cy: float
    w: float
    h: float


class CocoBox(BaseModel):
    ann_id: int
    category_id: int
    class_name: str
    x: float
    y: float
    w: float
    h: float


class StagedEdit(BaseModel):
    id: int
    action: str
    data: Dict[str, Any]


class AnnotationResponse(BaseModel):
    filename: str
    width: int
    height: int
    exif_orientation: int
    has_coco_file: bool
    yolo: List[YoloBox]
    coco: List[CocoBox]
    edits: List[StagedEdit]


class DatasetInfo(BaseModel):
    name: str
    slug: str


class InitialState(BaseModel):
    slug: str
    images: List[str]
    seen: List[str]
    last_seen_index: int


class EditAction(BaseModel):
    action: Literal["add", "delete", "move"]
    data: Dict[str, Any]
