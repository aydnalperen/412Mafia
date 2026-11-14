# LectureGraph (recording-first local demo)

Local-only, single-user scaffold. Create a course, upload an **MP4 video or MP3 audio recording**, and generate a transcript using OpenRouter's Whisper STT endpoint. The video **audio track only** is extracted with FFmpeg; no video frames are interpreted or slide synchronization claimed. You can also upload slide/exam files or a manual transcript as a fallback. Question matching and oral exams **are not implemented yet**. Do not expose this unauthenticated demo on a public network.

## Setup

Requires Python 3.11+, Node.js 20+, FFmpeg and FFprobe on `PATH`, a locally running PostgreSQL server, and an OpenRouter key with STT access.

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
   # Edit .env: set POSTGRES_PASSWORD, DJANGO_SECRET_KEY, and OPENROUTER_API_KEY.
   # Check that OPENROUTER_STT_MODEL is currently available for transcription.
   set -a; source .env; set +a
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py runserver 127.0.0.1:8000
   ```

3. Install FFmpeg/FFprobe if missing (`brew install ffmpeg` on macOS). In a **separate terminal**, load the same backend `.env` and start the recording worker (do not process media in the web request):

   ```sh
   cd backend
   set -a; source .env; set +a
   .venv/bin/python manage.py run_transcription_worker
   ```

4. In another terminal:

   ```sh
   cd frontend
   npm ci
   npm run dev -- --hostname 127.0.0.1
   ```

Visit <http://127.0.0.1:3000/courses>. The API is at <http://127.0.0.1:8000/api/courses/>. The frontend defaults to that URL; for another local backend port set `NEXT_PUBLIC_API_BASE_URL` before `npm run dev` and update the local CORS allowlist in `backend/config/middleware.py`.

From a course page, open **Materials**. Recording upload is the primary action: `.mp4` or `.mp3`, maximum 50 MB and 15 minutes by default. A queued job becomes `extracting_audio → transcribing → indexing → ready` or `failed`; its status and transcript preview survive a page refresh. The worker converts audio into 3-minute mono MP3 pieces, requests `verbose_json` segment timestamps from OpenRouter and shifts only **real provider timestamps** to absolute offsets; if the provider returns only text, time ranges are shown as unavailable. Costs are recorded per requested segment, with a conservative preflight software budget guard. Failed jobs can be retried by uploading the same recording again; retries or worker interruption **can incur another provider charge**. For a local demo, run just one worker. After a worker crash, stop all workers and run `python manage.py run_transcription_worker --recover --once` to mark stuck jobs failed, then reupload to retry; no automatic retry is attempted.

Other accepted formats: transcripts `.txt`, `.md`, `.srt`, `.vtt`; slides `.pdf`, `.pptx`; exams and study material `.pdf`, `.txt`, `.md`. These uploads are capped at 15 MB. PDF pages and PowerPoint slides keep their true page/slide numbers. Slides must contain selectable text; image-only slides need OCR, and legacy `.ppt` files are unsupported. Original uploads remain in `backend/media/` and are not publicly served. Upload only materials you are allowed to process.

## Checks

With backend dependencies installed, run `DB_ENGINE=sqlite .venv/bin/python manage.py test` and `DB_ENGINE=sqlite .venv/bin/python manage.py check`. The SQLite switch is only for local automated tests; normal runs require PostgreSQL environment variables. From `frontend/`, run `npm run typecheck` and `npm run build`.

## Current boundaries

- API requests must originate from loopback; browser writes are allowed only from local port 3000. No user authentication or public uploads exist. Do not deploy, tunnel, or place a publicly reachable reverse proxy in front of this version: the proxy could make external visitors appear to be local.
- `Material`, `SourceChunk`, `ExamQuestion` and `QuestionSourceLink` have migrations. `materials.segments.create_transcript_chunks` accepts real timed/untimed segments, shared by manual uploads and the future STT adapter; it does not invent timestamps. There is no question API yet.
- Keep `OPENROUTER_API_KEY` only in the backend environment; no real paid OpenRouter request is made by the automated tests. OpenRouter's availability, timestamp support and billing are provider-dependent; confirm them with a short authorized clip and a provider-side spending limit. FFmpeg must be installed separately. Do not run multiple workers simultaneously in this local demo.
