# LectureGraph (Phase A)

Local-only, single-user scaffold for the [P0 roadmap](ROADMAP.md). You can create and browse courses. Material upload, question matching and oral exams **are not implemented yet**; the transcript-segment persistence interface and provenance models are ready for the next phase. Do not expose this unauthenticated demo on a public network.

## Setup

Requires Python 3.11+, Node.js 20+, and a locally running PostgreSQL server.

1. Create a local PostgreSQL database and role (use your own password):

   ```sql
   CREATE ROLE lecturegraph LOGIN PASSWORD 'choose-a-local-password';
   CREATE DATABASE lecturegraph OWNER lecturegraph;
   ```

2. Set up the backend (from the repo root):

   ```sh
   cd backend
   python3 -m venv .venv
   .venv/bin/python -m pip install -r requirements.txt
   cp .env.example .env
   # Edit .env: set POSTGRES_PASSWORD to the password above and a local DJANGO_SECRET_KEY.
   set -a; source .env; set +a
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py runserver 127.0.0.1:8000
   ```

3. In another terminal:

   ```sh
   cd frontend
   npm ci
   npm run dev -- --hostname 127.0.0.1
   ```

Visit <http://127.0.0.1:3000/courses>. The API is at <http://127.0.0.1:8000/api/courses/>. The frontend defaults to that URL; for another local backend port set `NEXT_PUBLIC_API_BASE_URL` before `npm run dev` and update the local CORS allowlist in `backend/config/middleware.py`.

## Checks

With backend dependencies installed, run `DB_ENGINE=sqlite .venv/bin/python manage.py test` and `DB_ENGINE=sqlite .venv/bin/python manage.py check`. The SQLite switch is only for local automated tests; normal runs require PostgreSQL environment variables. From `frontend/`, run `npm run typecheck` and `npm run build`.

## Current boundaries

- API requests must originate from loopback; browser writes are allowed only from local port 3000. No user authentication or public uploads exist. Do not deploy, tunnel, or place a publicly reachable reverse proxy in front of this version: the proxy could make external visitors appear to be local.
- `Material`, `SourceChunk`, `ExamQuestion` and `QuestionSourceLink` have initial migrations, but no upload or question API yet. `materials.segments.create_transcript_chunks` accepts real timed/untimed segments; it does not invent timestamps.
- No OpenRouter call is made in Phase A. Keep any future `OPENROUTER_API_KEY` only in the backend environment.
