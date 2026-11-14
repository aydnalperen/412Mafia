#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - EXIT INT TERM
  for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing backend/.env. Copy backend/.env.example and set the local PostgreSQL credentials." >&2
  exit 1
fi

for port in 8000 3000; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop that service before starting LectureGraph." >&2
    exit 1
  fi
done

if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  python3 -m venv "$BACKEND_DIR/.venv"
fi

echo "Preparing backend dependencies..."
"$BACKEND_DIR/.venv/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"

if [[ ! -x "$FRONTEND_DIR/node_modules/.bin/next" ]] || ! (cd "$FRONTEND_DIR" && npm ls --depth=0 >/dev/null 2>&1); then
  echo "Preparing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm ci)
fi

set -a
source "$BACKEND_DIR/.env"
set +a

echo "Checking backend and applying migrations..."
(cd "$BACKEND_DIR" && .venv/bin/python manage.py check && .venv/bin/python manage.py migrate --noinput)

echo "Starting Django at http://127.0.0.1:8000"
(cd "$BACKEND_DIR" && exec .venv/bin/python manage.py runserver 127.0.0.1:8000 --noreload) &
BACKEND_PID=$!

echo "Starting Next.js at http://127.0.0.1:3000/courses"
(cd "$FRONTEND_DIR" && exec node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000) &
FRONTEND_PID=$!

echo "Press Ctrl+C to stop both services."
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

echo "A service stopped; shutting down the other service." >&2
exit 1
