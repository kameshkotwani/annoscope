import json
import sqlite3
from typing import Any, Dict, List

from app.config import DB_PATH


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS seen (
                dataset_slug TEXT,
                filename     TEXT,
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


def mark_seen(slug: str, filename: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen (dataset_slug, filename) VALUES (?, ?)",
            (slug, filename),
        )


def get_seen(slug: str) -> set[str]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT filename FROM seen WHERE dataset_slug = ?",
            (slug,),
        ).fetchall()
        return {r[0] for r in rows}


def add_staged_edit(slug: str, filename: str, action: str, data: dict):
    with sqlite3.connect(DB_PATH) as conn:
        if action == "move" and "line_index" in data:
            # one move per line_index — delete old, insert new
            conn.execute(
                """
                DELETE FROM staged_edits
                WHERE dataset_slug = ? AND filename = ? AND action = 'move'
                AND json_extract(data, '$.line_index') = ?
                """,
                (slug, filename, data["line_index"]),
            )
        conn.execute(
            "INSERT INTO staged_edits (dataset_slug, filename, action, data) VALUES (?, ?, ?, ?)",
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
        result = []
        for r in rows:
            try:
                data = json.loads(r["data"])
            except json.JSONDecodeError as e:
                raise ValueError(f"Corrupt edit row id={r['id']} for {filename}: {e}") from e
            result.append({"id": r["id"], "action": r["action"], "data": data})
        return result


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
