from __future__ import annotations

import typer
import uvicorn
from rich.console import Console
from rich.table import Table

console = Console()
cli = typer.Typer(help="annoscope — local-first dataset annotation viewer")


@cli.command()
def run(
    host: str = typer.Option("127.0.0.1", help="Bind host"),
    port: int = typer.Option(8000, help="Bind port"),
):
    """Start the annotation viewer server."""
    from app.config import config

    table = Table(title="annoscope", show_header=True, header_style="bold cyan")
    table.add_column("Dataset", style="bold")
    table.add_column("Slug", style="dim")
    table.add_column("Images dir")
    table.add_column("COCO")

    for ds in config.datasets:
        table.add_row(
            ds.name,
            ds.slug,
            str(ds.images_path),
            "✓" if ds.coco else "—",
        )

    console.print(table)
    console.print(f"[bold green]Starting[/bold green] http://{host}:{port}\n")

    uvicorn.run("app.main:app", host=host, port=port, reload=False)
