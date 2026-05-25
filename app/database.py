import json
import sqlite3
from typing import List, Dict, Any
from app.config import DB_PATH

def init_db():
    """Initialize SQLite database for review state."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS image_state (
                dataset_slug TEXT,
                filename TEXT,
                seen BOOLEAN DEFAULT 0,
                bad_yolo BOOLEAN DEFAULT 0,
                bad_coco BOOLEAN DEFAULT 0,
                PRIMARY KEY (dataset_slug, filename)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS staged_edits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_slug TEXT,
                filename TEXT,
                action TEXT,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

_VALID_STATE_FIELDS = {'seen'}

def update_state(slug: str, filename: str, field: str, value: bool):
    if field not in _VALID_STATE_FIELDS:
        raise ValueError(f"Invalid field: {field}")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            f"""
            INSERT INTO image_state (dataset_slug, filename, {field})
            VALUES (?, ?, ?)
            ON CONFLICT(dataset_slug, filename) DO UPDATE SET {field} = excluded.{field}
        """,
            (slug, filename, value),
        )

def get_db_state(slug: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT filename, seen FROM image_state WHERE dataset_slug = ?",
            (slug,),
        ).fetchall()
        return rows

def add_staged_edit(slug: str, filename: str, action: str, data: dict):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO staged_edits (dataset_slug, filename, action, data)
            VALUES (?, ?, ?, ?)
        """,
            (slug, filename, action, json.dumps(data)),
        )

def get_staged_edits(slug: str, filename: str) -> List[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, action, data FROM staged_edits 
            WHERE dataset_slug = ? AND filename = ?
        """,
            (slug, filename),
        ).fetchall()
        return [
            {"id": r["id"], "action": r["action"], "data": json.loads(r["data"])} for r in rows
        ]

def clear_staged_edits(slug: str, filename: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "DELETE FROM staged_edits WHERE dataset_slug = ? AND filename = ?", (slug, filename)
        )

def remove_staged_edit(edit_id: int, slug: str, filename: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "DELETE FROM staged_edits WHERE id = ? AND dataset_slug = ? AND filename = ?",
            (edit_id, slug, filename),
        )
