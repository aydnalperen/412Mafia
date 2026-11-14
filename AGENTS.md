# Repository guidance

- This repository currently has no application code, manifests, or runnable checks. `ROADMAP.md` is a proposed LectureGraph specification, not evidence that its suggested layout, commands, or features exist. Inspect the tree before assuming a scaffold is present.
- For implementation tasks, use `ROADMAP.md` as the product specification: finish the P0 transcript/PDF → sourced exam question → text oral-exam path before optional P1 video transcription, flashcards, or orchestration. Its phased prompts are suggestions, not completed work.
- Keep OpenRouter calls and credentials on the Django server; never expose the key through `NEXT_PUBLIC_*`. Treat uploaded materials as untrusted, and validate model-produced source IDs against real chunks in the same course. Never invent page numbers, timestamps, quotations, or matches.
- The roadmap permits an unauthenticated **local, isolated demo only**; do not make an unauthenticated upload/API instance publicly accessible. If implementing P1 media ingestion, process audio outside the HTTP request and do not claim frame-level slide synchronization.
- Once scaffolding exists, take build/test commands from its actual manifests and CI rather than guessing them from the roadmap. Do not claim checks ran while the repo has no runnable project.
