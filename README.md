# LectureGraph

LectureGraph is a local prototype for turning lecture recordings and course materials into reusable study sources. In this version, you can create a course, upload materials, and generate a transcript from an MP4 or MP3 recording. The question-to-source and adaptive oral exam workflows are described in the project overview and are planned features.

## Run locally

The commands below use Bash on macOS or Linux. Install Python 3.11 or later, Node.js 20 or later, PostgreSQL, and `lsof` for the start script. For recording transcription, also install FFmpeg and FFprobe and obtain an OpenRouter key with access to a speech-to-text model.

1. Create a local PostgreSQL role and database. Run these statements from a PostgreSQL administrator session, using your own password.

   ```sql
   CREATE ROLE lecturegraph LOGIN PASSWORD 'choose-a-local-password';
   CREATE DATABASE lecturegraph OWNER lecturegraph;
   ```

2. From the repository root, copy the environment template.

   ```bash
   cp backend/.env.example backend/.env
   ```

   Set `POSTGRES_PASSWORD` to the role password and set `DJANGO_SECRET_KEY` to a random local value. Keep the template database name, user, host and port unless your local database uses different values. For recordings, set `OPENROUTER_API_KEY` in this backend file and check `OPENROUTER_STT_MODEL`. The template selects `openai/whisper-large-v3`. Manual transcript imports work with an empty OpenRouter key.

3. From the repository root, start Django and Next.js.

   ```bash
   bash start-local.sh
   ```

   The script installs dependencies, checks Django, applies migrations, and starts the web servers on loopback. Open [the course list](http://127.0.0.1:3000/courses). Press Ctrl+C to stop both servers.

4. For recording transcription, open a separate terminal at the repository root and start one worker.

   ```bash
   cd backend
   set -a
   source .env
   set +a
   .venv/bin/python manage.py run_transcription_worker
   ```

Keep this unauthenticated prototype on loopback. Use course materials you have permission to process. The recording path sends extracted audio to OpenRouter. Keep the API key on the Django server.

## Try the prototype

1. Open **Courses**, create a course, and open **Materials**.
2. Choose **Transcript (fallback)** and upload TXT, MD, SRT or VTT. Verify that the material is ready. To inspect its contents, use `GET /api/materials/<material-id>/transcript/` on the local API at `http://127.0.0.1:8000`. Use `GET /api/courses/<course-id>/materials/` to look up the material ID. SRT/VTT cues retain their time ranges. Plain text returns null for both timestamps.
3. Upload a slide deck or past exam. Slides accept text-based PDF and PPTX, while exams and other study materials accept text-based PDF, TXT and MD. The material list reports processing status. Choose files with selectable text. The default limit for these uploads is 15 MB.
4. To try speech-to-text, upload a short MP4 or MP3 with the worker running. Default recording limits are 50 MB and 15 minutes. The job advances through extraction, transcription and indexing. Open the generated transcript when the job is ready. A failure appears on the materials screen.

After an interrupted worker, stop all workers and run `.venv/bin/python manage.py run_transcription_worker --recover --once` in the same backend environment. Reupload to retry, then restart the worker. A retry can incur another provider charge.

## How it works

| Layer | Implementation |
| --- | --- |
| Interface | Next.js 14, React 18 and TypeScript |
| API and data | Django 5.1, Django REST Framework, PostgreSQL and psycopg. SQLite supports automated checks. |
| Document intake | PyMuPDF and python-pptx extract selectable text and preserve page or slide numbers. A subtitle parser preserves cue times. |
| Recording intake | A Django management command uses FFprobe to validate media and FFmpeg to extract three-minute mono MP3 segments. OpenRouter runs the configured speech-to-text model. |

Django records the original file, course and processing status. Repeated uploads reuse records when applicable. The worker shifts provider timestamps by each audio segment's offset and persists the transcript linked to its original recording. Plain-text responses retain unavailable timestamps. The server estimates cost before transcription and logs usage by audio segment.

The question and question-source link models are present for future work. This snapshot supports course and material APIs, recording job status and transcript previews. It has no question matching, conversational examiner, or flashcard interface.

## Checks

After the local start script has installed dependencies, run the backend checks from `backend/`.

```bash
DB_ENGINE=sqlite .venv/bin/python manage.py check
DB_ENGINE=sqlite .venv/bin/python manage.py test
```

From `frontend/`, run the frontend checks.

```bash
npm run typecheck
npm run build
```

The recording tests use a simulated speech-to-text response. Use a short, authorized recording to validate the live provider route and timestamp support.
