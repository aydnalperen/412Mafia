# LectureGraph — Hackathon MVP Roadmap (v2: Video Transcription + Multi-Agent Architecture)

> **Priority update:** MP4 video / MP3 audio → Whisper transcription is now the **primary P0 ingestion path**, implemented before question matching or oral exams. Uploaded TXT/SRT/VTT transcripts remain a fallback. References below that call video ingestion “optional P1” describe the original plan and are superseded by this update. Video frames are not analyzed; timestamps are shown only when returned by the STT provider. **Implementation update:** STT now uses OpenAI's `whisper-1` API and `OPENAI_API_KEY`; OpenRouter remains for other LLM calls. Older OpenRouter STT prompts and price examples below are superseded.

> **Mission:** Turn uploaded lecture videos OR existing transcripts, lecture slides, and past exam questions into a connected, evidence-based study experience that helps students prepare for written and oral exams.
>
> **Core differentiator:** Students can navigate **exam question → relevant lecture transcript excerpt → relevant slide/page → adaptive oral exam → targeted revision cards**.
>
> **Implementation:** Next.js (TypeScript) + Django REST Framework + PostgreSQL + OpenRouter.
>
> **Constraints:** Hackathon-oriented MVP (~8 focused development hours), **$10 OpenRouter credit**, no visual video understanding/frame analysis, no production-scale infrastructure. **Video-to-transcript is planned as a self-contained P1 ingestion path; existing transcript upload remains the P0 fallback.**

## 0. Instructions for Codex

Use this file as the project specification and implementation checklist.

1. Build a **working, end-to-end vertical slice** before adding secondary features.
2. Prioritize **P0** tasks; do not spend time on P1/P2 until the core user journey works.
3. Support **video-to-transcript extraction via audio-only FFmpeg + OpenAI Whisper** in Phase B2. Do **not** analyze video frames, implement frame-accurate slide synchronization, or add real-time voice calling, microservices, Kubernetes, or a graph database.
4. Keep OpenRouter secrets and all AI calls **server-side** in Django.
5. Preserve provenance: every match, explanation, and evaluated answer must link to real uploaded source chunks. **Never fabricate source references.**
6. Prefer small, maintainable modules over abstractions. Add tests for each critical pipeline stage.
7. When an implementation detail is unspecified, choose the simplest reliable solution, document the choice, and continue.
8. Treat uploaded files and their contents as **untrusted input** (including prompt-injection attempts in PDFs/transcripts). Treat video/audio uploads as untrusted binary media; probe/validate and process with safe subprocess arguments.
9. After each phase, report implemented files, run commands, tests, and remaining blockers.
10. When time is short, replace expensive components with deterministic fallbacks—not fake AI results.

## 1. Product Scope

### Target user

A university student uploading their own permitted course materials and studying from a single course workspace. A lightweight professor-facing overview is a stretch goal, not a dependency.

### MVP input formats

- **Lecture transcripts (P0):** `.txt`, `.md`, `.srt`, `.vtt`
- **Lecture slides (P0):** text-based `.pdf`
- **Past exams and other study material (P0):** text-based `.pdf`, `.txt`, `.md`
- **Lecture recordings (P1 / Phase B2):** `.mp4`, `.mov`, `.webm`, `.m4v`; extract **audio only** and generate timestamped transcript via speech-to-text. Optional standalone `.mp3`, `.m4a`, `.wav` audio can reuse the same path.
- **Out of scope:** visual video interpretation/frame analysis, OCR for scanned PDFs, handwritten notes, PPTX parsing, live classroom integration.

### P0 — Must work in the demo

- [ ] Create/select a course.
- [ ] Upload a transcript, lecture slides, and a past exam file.
- [ ] Extract text and store chunks with page numbers or timestamps when available.
- [ ] Extract past exam questions; allow viewing them individually.
- [ ] Match a selected exam question with relevant transcript and slide chunks.
- [ ] Display **verifiable source references** and the reason for each match.
- [ ] Run a **text-based adaptive oral exam** with follow-up questions.
- [ ] Produce a concise exam report with strengths, missing concepts, and source-linked revision recommendations.

### P1 — Add only after P0 works (or in a parallel, isolated workstream)

- [ ] Upload a short lecture video or audio clip and generate a **timestamped transcript**, using the existing transcript ingestion pipeline afterward (Phase B2).
- [ ] Add bounded role-based orchestration for transcription → indexing → concept mapping → examiner → revision (Section 6.6).
- [ ] Generate source-grounded flashcards from topics or oral-exam weaknesses.
- [ ] Allow flashcard reveal and a simple Known / Review Again state.
- [ ] Show topic-level navigation across materials.

### P2 — Stretch goals / post-hackathon

- [ ] Professor dashboard for teaching–assessment coverage.
- [ ] Voice input/TTS for oral exams.
- [ ] Advanced PDF region highlighting, OCR, student cohort analytics, spaced repetition scheduling.
- [ ] Production user accounts, billing, object storage, background worker scaling.

## 2. User Journey / Demo Narrative

1. Open **LectureGraph** and create the course **Multimedia Signal Processing** (or another real permitted course).
2. Upload one transcript, one lecture slide deck, and a past-exam document. **If Phase B2 is finished**, upload a short video instead of the transcript and show its generated transcript.
3. Observe file processing states (`uploaded → processing → ready` or `failed`).
4. Open **Past Questions**, select one question about aliasing (example only).
5. View the best-matching lecture passages and slide pages, each with its true source reference.
6. Click **Start Oral Exam**; the AI asks a source-grounded question.
7. Give a deliberately incomplete text answer; the AI identifies what is missing and asks a targeted follow-up.
8. End after a few turns; view a report with cited concepts to revisit.
9. **If P1 is complete:** generate flashcards for the missed concepts and review a card.

**Success condition:** This entire flow works on the live application with uploaded files. Prepare a preprocessed seed course as a demo fallback, but label it clearly; it must use real extracted data, not invented results.

## 3. Architecture

```text
Next.js App Router + TypeScript + Tailwind + shadcn/ui
                     |
               REST / JSON
                     |
Django + Django REST Framework
  ├─ courses       Course CRUD
  ├─ materials     Upload, validation, PDF/text extraction, chunking
  ├─ transcription  (P1) FFmpeg audio extraction, STT, timestamp normalization
  ├─ knowledge     Topics, matching, retrieval, provenance
  ├─ exams         Past questions, oral sessions, evaluations
  ├─ flashcards    Generation and review (P1)
  ├─ orchestration (P1) Bounded workflow coordinator; typed agent handoffs
  └─ ai            OpenRouter client, prompts, schemas, usage limits
                     |
          PostgreSQL database
         (+ pgvector optional)
                     |
        OpenRouter HTTP API
   Chat/completion, STT, and optional embeddings
```

**Recommended simplifications:**

- Start without authentication for a **local, single-user demo**; keep the demo isolated. Never deploy a publicly writable unauthenticated instance.
- Local media storage is acceptable for the local prototype; avoid committing uploaded files.
- Start with normal synchronous processing for small **text/PDF** files; expose a status field. **Video transcription must run outside the HTTP request** via an asynchronous job/worker with status polling (lightweight process/job runner for demo; Celery/RQ only if needed).
- Use PostgreSQL. Add `pgvector` **only if it is quickly available**; a keyword/TF-IDF retrieval fallback is acceptable for a hackathon.
- Avoid a graph database. Model edges as relational records linking questions and source chunks.

## 4. Suggested Repository Layout

```text
lecturegraph/
├── ROADMAP.md
├── README.md
├── .gitignore
├── frontend/
│   ├── app/
│   │   ├── courses/page.tsx
│   │   └── courses/[courseId]/
│   │       ├── page.tsx
│   │       ├── materials/page.tsx
│   │       ├── questions/page.tsx
│   │       ├── oral/page.tsx
│   │       └── flashcards/page.tsx      # P1
│   ├── components/
│   └── lib/api.ts
└── backend/
    ├── manage.py
    ├── config/
    ├── courses/
    ├── materials/
    ├── transcription/                # media extraction, OpenAI Whisper STT
    ├── orchestration/                # P1: bounded workflow state and roles
    ├── knowledge/
    ├── exams/
    ├── flashcards/                    # P1
    ├── ai/
    │   ├── client.py
    │   ├── schemas.py
    │   ├── prompts.py
    │   └── budget.py
    ├── requirements.txt
    └── .env.example
```

## 5. Data Model

Implement with Django models and migrations. Actual names may vary but keep these responsibilities.

| Entity | Essential fields | Purpose |
|---|---|---|
| `Course` | `id`, `name`, `description`, `created_at` | Course workspace |
| `Material` | `id`, `course`, `kind`, `file`, `status`, `error`, `created_at`, `source_material_id` (optional) | Uploaded source or derived transcript/slides/exam |
| `TranscriptionJob` (P1) | `id`, `course`, `source_material`, `output_material`, `status`, `progress`, `model`, `duration_seconds`, `error`, `created_at`, `completed_at` | Async STT tracking and lineage |
| `SourceChunk` | `id`, `material`, `text`, `sequence`, `page_number`, `start_seconds`, `end_seconds`, `metadata` | Retrievable, citeable units |
| `Topic` | `id`, `course`, `name`, `description` | Shared concepts |
| `ExamQuestion` | `id`, `course`, `material`, `question_number`, `text`, `page_number` | Past-exam questions |
| `QuestionSourceLink` | `question`, `chunk`, `score`, `reason`, `method` | Explainable mapping |
| `OralSession` | `id`, `course`, `status`, `topic`, `started_at`, `ended_at`, `report_json` | Oral-exam state |
| `OralTurn` | `id`, `session`, `turn_index`, `question`, `answer`, `feedback_json`, `source_chunk_ids` | Adaptive interaction |
| `Flashcard` (P1) | `id`, `course`, `front`, `back`, `source_chunk_ids`, `review_state` | Targeted revision |
| `AIUsageEvent` | `id`, `task`, `model`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `created_at` | Usage/budget accounting |

**Relationships and integrity rules:**

- All referenced chunks must belong to the same course as the question/session/card.
- A source citation must contain a valid `SourceChunk.id` plus an actual page/timestamp if available.
- Persist the question text and every oral turn. Never rely on browser-local state for exam continuity.
- Use a uniqueness constraint for question ↔ chunk mappings.
- Derived transcripts must have a `source_material_id` pointing to the originating video/audio file. Save transcript segments with absolute time offsets; avoid creating duplicate transcripts when a file hash/model combination is unchanged.

## 6. Ingestion and Knowledge Mapping Pipeline

### 6.1 Upload and validation

- Accept only allowlisted formats; validate extensions **and file content**, enforce a sensible maximum size (e.g. 15 MB), and sanitize filenames.
- Save the file, create a `Material` record, mark it as `processing`, then `ready` or `failed` with an error message.
- Uploads must be limited to materials the user is entitled to process. Do not expose raw uploads publicly.
- Never execute uploaded content; never send secrets or local paths into AI prompts.

### 6.2 Extract

- `.txt`/`.md`: read normalized UTF-8 text.
- `.srt`/`.vtt`: parse cue timestamps and text; retain the time range for each segment.
- `.pdf`: use PyMuPDF and preserve **page numbers**. If little/no extractable text exists, flag the document as unsupported scanned content instead of claiming success.
- For exam PDFs, capture page origins when extracting questions.

### 6.3 Chunk

- Transcript: combine coherent adjacent lines/cues to approximately **500–1,000 tokens**, keeping the earliest and latest known timestamps.
- Slide/study material PDFs: chunk by page and then section when a page is unusually large; retain the page number.
- Normalize whitespace without destroying formulas or question numbering.
- Store stable source IDs. Do not merge unrelated pages into a chunk without page provenance.

### 6.4 Extract topics and past questions

- Start with rule-based question number detection; use the LLM to clean up irregular cases.
- Have the LLM return **strict structured output** for topic labels and question boundaries.
- Validate generated data using Pydantic and a backend schema; never treat free-form JSON as guaranteed valid.
- Show original extracted question text and provenance to the user. Do not present invented questions as past-exam questions.

### 6.5 Match questions to source chunks

1. Retrieve candidate chunks for each past question: prioritize course scope; use keyword/TF-IDF search initially and embeddings when configured.
2. Rank transcript and slide candidates independently so both source types have a chance to appear.
3. Optionally run an LLM reranker over a **small candidate set**, requesting relevance, reason, and cited chunk IDs.
4. **Validate every returned ID** against the candidates and database.
5. Save top matches and show the score / confidence as a heuristic, not a verified probability.
6. When nothing is relevant, show **“No reliable match found”** rather than a hallucinated link.

**Important:** Even if Phase B2 transcribes audio from video, **we do not analyze frames**. We can link **timestamped transcript excerpts** to slide pages and exam questions, but cannot guarantee which exact slide was shown at a specific moment. Do not claim frame-accurate synchronization.

### 6.6 Video/audio → timestamped transcript (P1, Phase B2)

**Design principle:** A video file is merely an **optional input source** for producing the exact same `SourceChunk` records used by P0. It must not change the oral exam, mapping, or flashcard APIs.

1. Accept a small, authorized, allowlisted recording (`.mp4`, `.mov`, `.webm`, `.m4v`; optionally `.mp3`, `.m4a`, `.wav`). For the live demo, test on a **3–10 minute clip** first; increase max size/duration only after profiling upload and extraction constraints.
2. Validate the container and stream metadata using `ffprobe`; reject corrupt files and recordings over configured duration/size limits. Avoid path traversal, unsafe shell expansion, and public raw-file URLs.
3. For video input, use `ffmpeg` to extract **mono speech audio**, e.g. 16 kHz compressed MP3 or compatible WAV. For audio input, normalize only when necessary. Never send raw video frames to an LLM.
4. Split long audio into independently processable segments (e.g. **2–5 minutes**) to respect model/provider timeouts and upload limits. For overlap, compute absolute timestamps and deduplicate repeated edge text; do not concatenate without offset correction.
5. POST the audio segments to `https://api.openai.com/v1/audio/transcriptions` using `OPENAI_API_KEY`, `whisper-1`, `response_format=verbose_json` and **segment-level timestamps**. A plain-text-only response is acceptable only with explicitly **unavailable** timestamps, never inferred/fabricated times.
6. Normalize provider responses to the internal segment schema: `{text, start_seconds, end_seconds, language?, provider?, model?}`. Shift timestamps by each segment's audio offset; keep exact media-to-transcript lineage. Export SRT/VTT if needed.
7. Create one derived `Material(kind=TRANSCRIPT)` containing the processed transcript and feed its segments into the **existing chunking, retrieval, topic mapping, and oral exam** code. Build a reusable `create_transcript_from_segments` service so manually uploaded SRT/VTT and generated STT follow one path.
8. Track states (`queued → extracting_audio → transcribing → indexing → ready`, with `failed`), cost/usage, retries, idempotency and cancellation (if practical). Preserve partial STT output safely, but do not mark the transcript ready until validated/indexed.
9. Add test fixtures for mismatched codecs, no audio stream, model timeout, malformed timestamps, overlapping segments, job retry, duplicate submission and budget exhaustion. Delete temporary audio after processing; expose configurable retention for original video.

**OpenAI STT reference:** <https://platform.openai.com/docs/api-reference/audio/createTranscription>. Verify current `whisper-1` pricing and access in the OpenAI account; the software budget is an estimate, not a provider-side billing limit.

### 6.7 Bounded multi-agent workflow (P1 architecture, minimal interfaces from P0)

Keep **agent roles** explicit so video transcription and manual transcripts feed the *same* downstream learning workflow. These are task-oriented modules, not unlimited autonomous agents:

| Role | Input | Output | Side effects / rules |
|---|---|---|---|
| `IngestionWorker` (deterministic) | Uploaded video/audio/transcript/PDF | Validated text segments and source chunks | Media STT only for video/audio, no unnecessary LLM calls |
| `ConceptMapper` (LLM + retrieval) | Source chunks + past exam question | Topic IDs and validated question-to-source links | May cite **only retrieved source IDs** |
| `Examiner` (LLM) | Course/topic + cited chunks + exam state | One oral question or adaptive follow-up | Bounded turns and token budget |
| `Evaluator` (LLM + checks) | Student response + original question + evidence | Structured formative feedback + verified cited IDs | Reject unverifiable citations; never impersonate professor |
| `RevisionPlanner` (LLM/logic) | Evaluations and missed concepts | Source-grounded flashcards/review actions | Skip AI if budget cap reached |

Build a simple **`WorkflowCoordinator`** that invokes the roles in a fixed sequence, records status, validates Pydantic outputs and retries each role at most once on transient errors. Each handoff uses typed records (`SourceChunkRef`, `TopicLink`, `ExamTurnFeedback`, `RevisionTask`) rather than raw, repeated document dumps. Prefer direct Python service calls over separate services. Do not add an agent framework solely for the "multi-agent" label.

**If using multiple Codex development agents:** assign isolated workstreams: (A) core Django ingestion/models, (B) Next.js UI, (C) STT/FFmpeg adapter, (D) mapping/exam prompts/tests. Merge through shared API/schema contracts; do not let agents edit the same files concurrently.

## 7. AI Oral Exam Engine (P0)

**Mode:** Text-only, multi-turn, adaptive, source-grounded.

### Session configuration

- User picks a course and optionally a topic or a past question.
- Use a bounded session, e.g. **3 questions / up to 5 turns**, configurable.
- For each turn, retrieve only relevant source chunks and recent session history; avoid submitting entire documents repeatedly.

### Turn algorithm

1. Retrieve trusted source chunks for the current topic.
2. Generate the opening oral question or the next follow-up.
3. Accept the student's text answer.
4. Ask the AI to evaluate **accuracy, completeness, and missing concepts**, using only source evidence.
5. Return feedback and either a follow-up question or a new question, depending on the answer and turn budget.
6. Persist the turn and source references.
7. At the end, produce a brief strengths/weaknesses report with targeted revision sources.

### Structured response contract (illustrative)

```json
{
  "feedback": {
    "accuracy": 3,
    "completeness": 2,
    "max_score": 5,
    "correct_points": ["Identified the purpose of an anti-aliasing filter"],
    "missing_points": ["Did not explain spectral overlap"],
    "source_chunk_ids": [12, 18]
  },
  "next_question": "How does the spectrum change when downsampling by a factor of M?",
  "next_action": "follow_up",
  "session_complete": false
}
```

Allowed `next_action` values: `follow_up`, `new_question`, `finish`.

### Guardrails

- Present it as a **course-grounded exam simulator**, not the actual professor or official grading system.
- Never claim to know a professor's true grading rubric unless an actual rubric was uploaded.
- Prefer excerpts from user-provided course materials; disclose uncertainty when material does not support an answer.
- Never invent direct quotations or specific slide/page references.
- Treat model scoring as **formative feedback**, not a certified academic grade.
- Constrain number of turns and tokens so the oral exam cannot run indefinitely.

## 8. API Contract (Django REST Framework)

Use `/api/` as the common prefix. Return JSON and consistent validation errors.

| Method | Endpoint | Request / Result |
|---|---|---|
| `POST` | `/api/courses/` | Create course → course JSON |
| `GET` | `/api/courses/` | List courses |
| `GET` | `/api/courses/{id}/` | Course overview |
| `POST` | `/api/courses/{id}/materials/` | Multipart upload: `file`, `kind` → material/status |
| `GET` | `/api/courses/{id}/materials/` | Files and processing states |
| `POST` | `/api/courses/{id}/recordings/` | P1: multipart video/audio upload → `TranscriptionJob` status |
| `GET` | `/api/transcription-jobs/{jobId}/` | P1: stage, progress, derived transcript material ID, error |
| `GET` | `/api/materials/{id}/transcript/` | P1: normalized timed transcript segments (only when ready/authorized) |
| `GET` | `/api/courses/{id}/questions/` | Extracted exam questions |
| `GET` | `/api/questions/{id}/sources/` | Ranked chunks with material title, page/timestamp, reason, score |
| `POST` | `/api/courses/{id}/oral/start/` | `{ "topic": "optional" }` → session + first question |
| `POST` | `/api/oral/{sessionId}/answer/` | `{ "answer": "..." }` → feedback + next question or completion |
| `GET` | `/api/oral/{sessionId}/report/` | Final report with citation IDs |
| `POST` | `/api/courses/{id}/flashcards/generate/` | Generate cards (P1) |
| `GET` | `/api/courses/{id}/flashcards/` | List cards (P1) |

Implementation notes:

- Use serializers and explicit permissions/single-user demo boundaries.
- Ensure repeated clicks or retries do not silently create duplicated materials/questions/turns.
- Add loading, failed, and empty states to all frontend API interactions.
- Use a predictable error shape, such as `{ "error": { "code": "...", "message": "..." } }`.

## 9. OpenRouter and Budget Control

### Environment configuration

```dotenv
# backend/.env.example — copy to backend/.env and set real secrets locally
OPENROUTER_API_KEY=
OPENAI_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_FAST_MODEL=
OPENROUTER_EXAM_MODEL=
OPENROUTER_EMBEDDING_MODEL=
# P1: local FFmpeg and upload guards
FFMPEG_BIN=ffmpeg
FFPROBE_BIN=ffprobe
MAX_MEDIA_UPLOAD_MB=250
MAX_MEDIA_DURATION_MINUTES=15
AI_BUDGET_USD=8.00
AI_MAX_SESSION_TURNS=5
AI_MAX_CANDIDATE_CHUNKS=8
```

- **Do not hardcode a specific model or its price:** model availability and pricing can change. Choose currently supported models in the OpenRouter dashboard, then populate environment variables.
- Implement a single provider adapter in `backend/ai/client.py` for timeout handling, retry on transient failures, structured JSON parsing, and usage metadata.
- Cache extracted text, chunks, question extraction, and stored links; **never reprocess unchanged source files on every request**.
- Set strict output-token limits, bounded context windows, and a small number of candidate passages.
- Log per-request token usage and estimate costs using configurable rates or provider-reported cost when available. **Also track duration-based STT billing** using returned `usage.cost` when present, falling back to configurable cost per audio second.
- Before an AI call, perform an approximate budget check; reject nonessential new AI operations after **$8 estimated spend** and reserve ~$2 buffer. Because estimates can lag actual billing, also configure a provider-side budget/spend limit if available.
- Ensure one expensive error does not trigger unbounded retries. Cap retry attempts.
- Provide a zero-cost deterministic fallback for matching (e.g., keyword/TF-IDF) when embeddings or LLM calls are unavailable.
- Never expose `OPENROUTER_API_KEY` through Next.js `NEXT_PUBLIC_*` variables.

## 10. Frontend Routes and Components

| Route | Primary UI |
|---|---|
| `/courses` | Course list and create-course dialog |
| `/courses/[courseId]` | Course dashboard, processing status, primary actions |
| `/courses/[courseId]/materials` | Upload panels (transcript, slides, past exams), plus optional video/audio recording uploader (P1) with progress and transcript preview |
| `/courses/[courseId]/questions` | Question list and source panel with page/timestamp references |
| `/courses/[courseId]/oral` | Question, text answer, submitted turns, feedback, progress, report |
| `/courses/[courseId]/flashcards` | Flip cards, Known / Review Again (P1) |

**UX priorities:**

- Keep the **question → sources** view central; it is the product's differentiation.
- Display source **file name + page number or time range** next to each quote.
- If a transcript has no timestamps, show segment number rather than inventing times.
- Make oral exam interaction feel responsive with loading indicators and clear current-state text.
- Avoid a large, unvalidated knowledge-graph visualization in the MVP; use a clear linked-list/two-column view.

## 11. Eight-Hour Implementation Schedule

| Window | Deliverables | Exit criteria |
|---|---|---|
| **00:00–01:00** | Repo scaffold, Django/Next.js, DB, course CRUD, OpenRouter adapter skeleton | Can create and list a course |
| **01:00–02:15** | Uploads, validators, PDF/text/SRT/VTT extraction, source chunk persistence | Three file types processed with provenance |
| **02:15–03:30** | Past question extraction, retrieval/matching, question source endpoint and UI | A real question shows real transcript/slide sources |
| **03:30–05:00** | Oral exam start/answer/report APIs, prompts, UI, persistence | Can complete a short adaptive exam |
| **05:00–06:00** | **P1 choice:** implement the minimal video→transcript adapter via OpenRouter **or** flashcards; split between parallel owners if possible | A short recording generates a real timed transcript, OR flashcards work; neither blocks P0 |
| **06:00–08:00** | Integration tests, budget guardrail, demo seed, failure recovery, pitch walkthrough | End-to-end demo passes twice without manual fixes |

**Timebox rule:** Stop adding features in the final 90 minutes. Fix only demo-breaking bugs and polish the narrative. If video ingestion threatens to derail the core demo, retain the working manual transcript upload and defer Phase B2; do not fake a video transcription.

## 12. Testing and Acceptance Criteria

### Backend / pipeline

- [ ] Valid transcript, text PDF, and SRT/VTT files process correctly.
- [ ] **P1:** Small video/audio input yields a real, source-linked transcript with truthful timestamps and a visible job status.
- [ ] **P1:** Transcription failures, no-audio streams, upload limits, duplicate uploads and over-budget requests fail safely.
- [ ] **P1:** Manual and STT-derived transcripts produce the same downstream `SourceChunk` schema.
- [ ] Invalid/oversized files fail safely with useful errors.
- [ ] Extracted PDF chunks retain the correct page number.
- [ ] Extracted subtitle chunks retain the correct start/end times.
- [ ] An extracted exam question retains its original text and file/page provenance.
- [ ] The matching endpoint never returns a chunk from another course.
- [ ] LLM-suggested invalid chunk IDs are rejected, not displayed.
- [ ] An unrelated question can return zero matches instead of fabricated sources.
- [ ] Oral exam state survives a page refresh.
- [ ] Oral exam respects the max-turn limit and returns a report.
- [ ] Budget cap and API failure produce graceful errors or a deterministic fallback.

### Frontend / demo

- [ ] Course creation works.
- [ ] Upload screen shows meaningful states and supports retry.
- [ ] Questions show their original source and matched evidence.
- [ ] Oral session can start, accept answers, ask follow-ups, and end.
- [ ] Report identifies weaknesses and links back to actual materials.
- [ ] No API key appears in client bundles or requests.
- [ ] Local setup works using only README instructions.

### Quality bar

Test a small labeled sample of **10–20 question-to-source matches** manually and record precision/top-k hit rate. Do not invent performance percentages for the pitch.

## 13. Risks and Fallback Decisions

| Risk | Mitigation / fallback |
|---|---|
| Scan-only PDFs have no extractable text | Show a clear unsupported/OCR-needed status; use text PDFs for demo |
| Question extraction is imperfect | Add manual question entry/edit or paste a question as fallback |
| Noisy transcript-to-slide matching | Show several candidates and original evidence; allow no-match |
| OpenRouter errors, throttling, or depleted credits | Preserve course browsing and deterministic search; disable AI actions gracefully |
| AI outputs malformed JSON | Validate/retry once with a strict schema, then show recoverable error |
| Ingestion too slow for the presentation | Use a clearly labeled preprocessed seed course backed by real files; manual transcript input remains available |
| Video upload/STT timeouts or excessive file sizes | Compress/extract audio, split into bounded segments, run a background job, and show progress; demo with a short clip |
| Missing timestamp data from an STT provider | Select a provider with segment timestamps or mark time ranges unavailable; never invent offsets |
| Feature creep | Defer P1/P2 and finish P0 integration |
| Confidential/copyrighted material exposure | Use authorized materials, private local files, and avoid publicly exposed upload routes |

## 14. Definition of Done

The MVP is done when:

1. A course can be created and real user-supplied documents can be ingested.
2. A past exam question can be opened with **real, navigable transcript and slide references**.
3. A multi-turn AI oral exam uses those sources and adapts its next question to the student's answer.
4. The resulting feedback cites real material and identifies relevant concepts to revise.
5. The demo runs locally end-to-end, errors fail gracefully, and OpenRouter use is budget-controlled.

Video-to-transcript (Phase B2) and flashcards are valuable second-tier features; the product is **not blocked** if either is unfinished. However, the architecture and API contract **must** leave a clean extension point for both.

## 15. Suggested Codex Execution Prompts

Work through these prompts sequentially rather than asking one agent to build everything at once.

### Phase A — Scaffold and models

> Read `ROADMAP.md`. Implement only Phase A: scaffold Next.js and Django REST Framework, configure PostgreSQL, create `Course`, `Material`, `SourceChunk`, `ExamQuestion`, and `QuestionSourceLink` models with migrations, implement course CRUD, and add `.env.example` and a clear README. Run relevant checks. Report commands, changed files, and blockers. Do not begin P1/P2.

### Phase B — Ingestion

> Read `ROADMAP.md` and the current repository. Implement secure upload and text extraction for TXT/MD/SRT/VTT and text-based PDF, preserving provenance, processing status, and chunk boundaries. Add tests for timestamps, page numbers, invalid formats, and empty scans. Integrate upload UI. Add a reusable transcript-segment ingestion interface so Phase B2 can feed it. Do not implement video, OCR, or voice in this phase.

### Phase B2 — Optional video-to-transcript (separate parallel workstream)

> Read `ROADMAP.md` (Sections 6.6–6.7). Implement the isolated recording upload and transcription pipeline: FFprobe validation, FFmpeg audio extraction, bounded audio segmentation, OpenRouter `/audio/transcriptions` adapter using `OPENROUTER_STT_MODEL`, segment timestamp normalization, job polling, file lineage, budget usage, retry-safe state, and a derived transcript material fed into existing chunk ingestion. Start with a short recording; do not analyze frames or attempt slide-on-video synchronization. Add tests and graceful failure modes. Do not modify the exam/retrieval contract.

### Phase C — Retrieval and evidence

> Implement past-exam question extraction and question-to-source retrieval from `ROADMAP.md`. Start with reliable local keyword/TF-IDF matching, add optional OpenRouter/embedding ranking only if practical, enforce course boundaries and valid citation IDs, and build the question/source page. Add test fixtures and an explicit no-reliable-match state.

### Phase D — Adaptive oral exam

> Implement the text-only oral exam engine from `ROADMAP.md` using a Django OpenRouter adapter and validated structured output. Persist sessions/turns, enforce turn/token limits, produce source-grounded follow-ups and reports, and build the Next.js exam UI. Log AI usage and enforce an approximate $8 software budget cap. Test AI failures and invalid source IDs.

### Phase E — Optional flashcards and demo hardening

> If all P0 acceptance criteria pass, implement flashcards generated from missed concepts with valid source references and basic review state. Otherwise prioritize P0 bug fixes. Add a real-data seed demo, run an end-to-end smoke test, complete README instructions, and summarize known limitations honestly.

---

## 16. Pitch Summary

**Problem:** Course content, lecture explanations, and past exams are scattered across documents. Students spend time finding connections instead of practicing. Oral-exam preparation is especially difficult without realistic feedback.

**Solution:** LectureGraph converts lecture recordings **or** existing course transcripts, alongside slides and past exams, into an evidence-linked course map and an adaptive oral examiner. Bounded AI roles collaborate through typed, source-grounded handoffs.

**Demo hook:** *Upload a transcript (or, if Phase B2 is ready, a lecture video) → click a past-exam question → see which timed lecture passages and slide pages support it → practice an oral answer → receive a follow-up and targeted revision advice.*

**Educational impact:** Students get faster navigation and better active recall; professors can later understand how teaching material aligns with assessment. The MVP demonstrates the student journey while keeping professor analytics as a future extension.

**One-line pitch:** **“From static course materials to evidence-based, adaptive exam preparation.”**


## 17. Video + Multi-Agent Delivery Priority

**Decision:** Video-to-transcript is **included in the product roadmap** but **must not block** the validated transcript-first demo. Prefer implementing Phase B2 in parallel after Phase A establishes the shared `Material`/`SourceChunk` contract. OpenAI handles only Whisper STT; OpenRouter remains for LLM calls. Transcription is a separate API request, not a chat prompt. Agent roles consume trusted normalized transcript text—not raw video—to minimize cost and context size.

**Recommended next Codex instruction:** `Implement Phase A, including a stable transcript-segment interface and material lineage. Keep the Phase B2 contract in mind, but do not spend core-path time on video upload until transcript ingestion works. Assign video STT to a separate worker/agent when parallelism is available.`
