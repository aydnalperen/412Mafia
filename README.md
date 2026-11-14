# LectureGraph (recording-first local demo)

Local-only, single-user scaffold. Create a course, upload an **MP4 video or MP3 audio recording**, and generate a transcript using OpenAI's Whisper API. The video **audio track only** is extracted with FFmpeg; no video frames are interpreted or slide synchronization claimed. You can also upload slide/exam files or a manual transcript as a fallback. Numbered past-exam questions can be linked to actual transcript/slide/study chunks; oral exams are **not implemented yet**. Do not expose this unauthenticated demo on a public network.

## Setup

Requires Python 3.11+, Node.js 20+, FFmpeg and FFprobe on `PATH`, a locally running PostgreSQL server, and an OpenAI API key with Whisper access and billing enabled. OpenRouter is optional for question/source analysis.

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
    # Edit .env: set POSTGRES_PASSWORD, DJANGO_SECRET_KEY, and OPENAI_API_KEY.
    # Optional: set OPENROUTER_API_KEY and OPENROUTER_FAST_MODEL for source reranking.
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

From a course page, open **Materials**. Recording upload is the primary action: `.mp4` or `.mp3`, maximum 50 MB and 15 minutes by default. A queued job becomes `extracting_audio → transcribing → indexing → ready` or `failed`; its status and transcript preview survive a page refresh. The worker converts audio into 3-minute mono MP3 pieces, requests `whisper-1` with `verbose_json` segment timestamps from OpenAI and shifts only **real provider timestamps** to absolute offsets; if the provider returns only text or a segment time extends beyond the extracted audio, that segment's time is shown as unavailable. Costs are estimated per requested segment (OpenAI does not return USD cost in the STT response), with a conservative preflight software budget guard; check the current Whisper price and set `STT_ESTIMATED_USD_PER_SECOND` accordingly. Failed jobs can be retried by uploading the same recording again; retries or worker interruption **can incur another provider charge**. For a local demo, run just one worker. After a worker crash, stop all workers and run `python manage.py run_transcription_worker --recover --once` to mark stuck jobs failed, then reupload to retry; no automatic retry is attempted.

Other accepted formats: transcripts `.txt`, `.md`, `.srt`, `.vtt`; slides `.pdf`, `.pptx`; exams and study material `.pdf`, `.txt`, `.md`. These uploads are capped at 15 MB. PDF pages and PowerPoint slides keep their true page/slide numbers. Slides must contain selectable text; image-only slides need OCR, and legacy `.ppt` files are unsupported. Original uploads remain in `backend/media/` and are not publicly served. Upload only materials you are allowed to process.

Upload a past exam with numbered questions (`1. …`, `2) …`, `Soru 3: …`) or lettered sections with points (`A. … (10 points)`), then open **Exam questions and sources** from the course page. Questions retain their literal text and originating PDF page (if applicable); lettered sections stop at a `Solution.` heading so answer steps are not extracted as questions. The local keyword/IDF matcher searches only ready transcript, slide and study chunks in the same course and requires multiple shared terms; an unmatched question shows **No reliable match found**. Optionally set `OPENROUTER_API_KEY` and `OPENROUTER_FAST_MODEL` in the backend environment to rerank up to 12 lexical candidates through OpenRouter. Only real candidate chunk IDs can be cited; provider errors or invalid responses fall back to keyword matching. Each source request can incur an OpenRouter charge and sends the question and candidate excerpts to the provider; model scores and explanations are heuristics, so review the original chunk. Lexical candidate retrieval still misses paraphrases. Unsupported/scan-only exam questions are not invented; supply an extractable numbered or lettered document.

## Checks

With backend dependencies installed, run `DB_ENGINE=sqlite .venv/bin/python manage.py test` and `DB_ENGINE=sqlite .venv/bin/python manage.py check`. The SQLite switch is only for local automated tests; normal runs require PostgreSQL environment variables. From `frontend/`, run `npm run typecheck` and `npm run build`.

## Current boundaries

- API requests must originate from loopback; browser writes are allowed only from local port 3000. No user authentication or public uploads exist. Do not deploy, tunnel, or place a publicly reachable reverse proxy in front of this version: the proxy could make external visitors appear to be local.
- `Material`, `SourceChunk`, `ExamQuestion` and `QuestionSourceLink` have migrations. `materials.segments.create_transcript_chunks` accepts real timed/untimed segments, shared by manual uploads and STT; it does not invent timestamps. Question and source APIs return only real course material; no LLM citation IDs are accepted.
- Keep `OPENAI_API_KEY` and `OPENROUTER_API_KEY` only in the backend environment; automated tests make no paid provider requests. OpenAI Whisper access, timestamp support and billing require confirmation with a short authorized clip and a provider-side spending limit. FFmpeg must be installed separately. Do not run multiple workers simultaneously in this local demo.
