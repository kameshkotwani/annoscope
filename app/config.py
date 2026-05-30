from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml
from pydantic import BaseModel, Field, ValidationError
from rich.console import Console
from rich.panel import Panel

_console = Console(stderr=True)

# Project root (one level above 'app')
PROJ_ROOT = Path(__file__).resolve().parents[1]

# Supported image formats
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}

# Database path for review state and staged edits
DB_PATH = PROJ_ROOT / "review_state.sqlite"

# Configuration file paths
CFG_LOCAL = PROJ_ROOT / "datasets.local.yaml"
CFG_DEFAULT = PROJ_ROOT / "datasets.yaml"
CFG_PATH = CFG_LOCAL if CFG_LOCAL.exists() else CFG_DEFAULT


class DatasetConfig(BaseModel):
    name: str
    slug: str
    images: str
    labels: str
    coco: Optional[str] = None
    classes: Dict[int, str] = Field(default_factory=dict)

    # Resolved absolute paths
    @property
    def images_path(self) -> Path:
        return PROJ_ROOT / self.images

    @property
    def labels_path(self) -> Path:
        return PROJ_ROOT / self.labels

    @property
    def coco_path(self) -> Optional[Path]:
        return PROJ_ROOT / self.coco if self.coco else None


class AppConfig(BaseModel):
    datasets: List[DatasetConfig]


def load_config(path: Path = CFG_PATH) -> AppConfig:
    with open(path) as f:
        data = yaml.safe_load(f)
    if not data:
        raise ValueError(f"Config file {path} is empty.")
    return AppConfig(**data)


# Singleton instance for the app
try:
    config = load_config()
except FileNotFoundError:
    _console.print(
        Panel(
            f"[bold]Config file not found:[/bold] [yellow]{CFG_PATH}[/yellow]\n\n"
            "See [cyan]datasets.yaml[/cyan] for an example.",
            title="[red]Missing config[/red]",
            border_style="red",
        )
    )
    raise SystemExit(1)
except ValidationError as e:
    _console.print(
        Panel(
            f"[bold]Config file:[/bold] [yellow]{CFG_PATH}[/yellow]\n\n" + str(e),
            title="[red]Invalid config[/red]",
            border_style="red",
        )
    )
    raise SystemExit(1)
except Exception as e:
    _console.print(
        Panel(
            f"[bold]Config file:[/bold] [yellow]{CFG_PATH}[/yellow]\n\n[red]{e}[/red]",
            title="[red]Failed to load config[/red]",
            border_style="red",
        )
    )
    raise SystemExit(1)
