#!/bin/sh
# entrypoint.sh — Production startup script for RepoGPT backend
# Runs Alembic DB migrations before starting the API server.
set -e

echo "Running database migrations..."
alembic upgrade head || echo "Alembic migrations step finished with warning, continuing to app startup..."

echo "Starting RepoGPT backend..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
