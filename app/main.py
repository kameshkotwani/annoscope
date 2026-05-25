from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.config import config
from app.database import init_db
from app.state import active_dataset
from app.routes import router

# ── app initialization ─────────────────────────────────────────────────────────

app = FastAPI(title="Annotation Viewer")

# Initialize database
init_db()

# Load first dataset at startup
if config.datasets:
    active_dataset.load(config.datasets[0].slug)

# ── mounts ─────────────────────────────────────────────────────────────────────

# Mount image directories dynamically based on config
for ds in config.datasets:
    if ds.images_path.exists():
        app.mount(
            f"/imgs/{ds.slug}",
            StaticFiles(directory=str(ds.images_path)),
            name=f"images_{ds.slug}",
        )

# Mount static assets (JS, CSS, HTML)
app.mount(
    "/static",
    StaticFiles(directory=str(Path(__file__).parent / "static")),
    name="static",
)

# ── include routes ─────────────────────────────────────────────────────────────

app.include_router(router)
