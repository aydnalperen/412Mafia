# LectureGraph (Phase B)

Local-only, single-user implementation of the first two [P0 roadmap](ROADMAP.md) phases. Create courses and upload transcript, slide, exam and study files. Real page numbers and subtitle time ranges are stored with extracted source chunks. Question extraction/matching and oral exams **are not implemented yet**. Do not expose this unauthenticated demo on a public network.

## Setup

Requires Python 3.11+, Node.js 20+, and a locally running PostgreSQL server.

For an already configured local database and `backend/.env`, start both services from the repository root:

```sh
./start-local.sh
```

The script installs missing dependencies, checks Django, applies pending migrations, and starts both servers on loopback. Press Ctrl+C to stop both. First-time database and `.env` setup is described below.

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

From a course page, open **Materials**. Accepted formats: transcripts `.txt`, `.md`, `.srt`, `.vtt`; slides `.pdf`, `.pptx`; exams and study material `.pdf`, `.txt`, `.md`. Each upload is capped at 15 MB. PDF pages and PowerPoint slides keep their true page/slide numbers. Slides must contain selectable text; image-only slides need OCR, and legacy `.ppt` files are unsupported (convert them to `.pptx` first). Scanned/invalid files remain marked `failed` with an explanation. Identical uploads to the same course/kind return the original material rather than adding duplicates. Originals are stored under `backend/media/` and are not publicly served. Upload only materials you are allowed to process.

## Checks

With backend dependencies installed, run `DB_ENGINE=sqlite .venv/bin/python manage.py test` and `DB_ENGINE=sqlite .venv/bin/python manage.py check`. The SQLite switch is only for local automated tests; normal runs require PostgreSQL environment variables. From `frontend/`, run `npm run typecheck` and `npm run build`.

## Current boundaries

- API requests must originate from loopback; browser writes are allowed only from local port 3000. No user authentication or public uploads exist. Do not deploy, tunnel, or place a publicly reachable reverse proxy in front of this version: the proxy could make external visitors appear to be local.
- `Material`, `SourceChunk`, `ExamQuestion` and `QuestionSourceLink` have migrations. `materials.segments.create_transcript_chunks` accepts real timed/untimed segments, shared by manual uploads and the future STT adapter; it does not invent timestamps. There is no question API yet.
- No OpenRouter call is made in Phase A. Keep any future `OPENROUTER_API_KEY` only in the backend environment.
