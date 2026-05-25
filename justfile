set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

activate_cmd := "source .venv/bin/activate"

default:
    @just --list

# Print the command to activate the local virtual environment.
activate:
    @echo "{{activate_cmd}}"

# Run the FastAPI annotation viewer.
app:
    uvicorn app.main:app --host 127.0.0.1 --port 8000


