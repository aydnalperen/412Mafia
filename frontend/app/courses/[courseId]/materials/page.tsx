"use client";

import { useEffect, useState } from "react";
import {
  apiErrorMessage,
  materialsApi,
  recordingsApi,
  type Material,
  type MaterialKind,
  type TranscriptSegment,
  type TranscriptionJob,
} from "@/lib/api";

const kinds: Array<{
  value: Exclude<MaterialKind, "recording">;
  label: string;
}> = [
  { value: "transcript", label: "Transcript (fallback)" },
  { value: "slides", label: "Slides" },
  { value: "exam", label: "Past exam" },
  { value: "study", label: "Study material" },
];

export default function MaterialsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;
  const [materials, setMaterials] = useState<Material[]>([]);
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [recording, setRecording] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] =
    useState<Exclude<MaterialKind, "recording">>("transcript");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([materialsApi.list(id), recordingsApi.list(id)])
      .then(([items, jobs]) => {
        if (!cancelled) {
          setMaterials(items);
          setJob(jobs[0] ?? null);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    if (job.status === "ready" && job.output_material_id != null) {
      materialsApi
        .transcript(job.output_material_id)
        .then((items) => {
          if (!cancelled) setTranscript(items);
        })
        .catch((cause) => {
          if (!cancelled) setError(apiErrorMessage(cause));
        });
      materialsApi
        .list(id)
        .then((items) => {
          if (!cancelled) setMaterials(items);
        })
        .catch(() => {});
    } else if (job.status !== "failed") {
      const timer = setTimeout(() => {
        recordingsApi
          .job(job.id)
          .then((updated) => {
            if (!cancelled) setJob(updated);
          })
          .catch((cause) => {
            if (!cancelled) setError(apiErrorMessage(cause));
          });
      }, 2000);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [id, job?.id, job?.status, job?.progress]);

  async function uploadRecording(event: React.FormEvent) {
    event.preventDefault();
    if (!recording || uploading) return;
    const form = event.currentTarget as HTMLFormElement;
    setUploading(true);
    setError(null);
    setTranscript(null);
    try {
      setJob(await recordingsApi.upload(id, recording));
      setRecording(null);
      form.reset();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  async function uploadMaterial(event: React.FormEvent) {
    event.preventDefault();
    if (!file || uploading) return;
    const form = event.currentTarget as HTMLFormElement;
    setUploading(true);
    setError(null);
    try {
      const item = await materialsApi.upload(id, { file, kind });
      setMaterials((items) => [
        item,
        ...items.filter((previous) => previous.id !== item.id),
      ]);
      setFile(null);
      form.reset();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <main className="page container">
        <div className="page-header">
          <span className="eyebrow">Course Materials</span>
          <h1>Materials</h1>
        </div>
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <p style={{ margin: 0 }}>Loading…</p>
        </div>
      </main>
    );
  }

  const jobBadgeClass =
    job?.status === "ready"
      ? "status-ready"
      : job?.status === "failed"
        ? "status-failed"
        : "status-active";

  return (
    <main className="page container">
      <div className="page-nav">
        <a href={`/courses/${id}`} className="back-link">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to course</span>
        </a>
        <a href={`/courses/${id}/questions`} className="btn secondary small">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span>Exam questions and sources</span>
        </a>
      </div>

      <div className="page-header">
        <span className="eyebrow">Ingestion &amp; Indexing</span>
        <h1>Materials</h1>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="materials-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-icon" aria-hidden="true">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </span>
            <h2>1. Upload a lecture recording</h2>
          </div>

          <form className="form" onSubmit={uploadRecording}>
            <div className="field">
              <label htmlFor="recording">MP4 video or MP3 audio</label>
              <div className="file-input-wrap">
                <input
                  id="recording"
                  type="file"
                  accept=".mp4,.mp3"
                  required
                  onChange={(event) =>
                    setRecording(event.target.files?.[0] ?? null)
                  }
                />
              </div>
            </div>

            <button
              className="btn full"
              disabled={!recording || uploading}
              type="submit"
            >
              {uploading ? "Uploading…" : "Generate transcript"}
            </button>

            <p className="note">
              Your upload is transcribed in the background. No video frames are analyzed.
            </p>

            {job && (
              <div className="card status-card" role="status">
                <div className="status-row">
                  <strong className="tabular">
                    Transcription: {job.status.replaceAll("_", " ")} ({job.progress}%)
                  </strong>
                  <span className={`badge ${jobBadgeClass}`}>
                    <span className="badge-dot" aria-hidden="true" />
                    {job.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <div
                    className={`progress-fill ${
                      job.status === "ready"
                        ? "ready"
                        : job.status === "failed"
                          ? "failed"
                          : ""
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                {job.status === "failed" && <p className="error">{job.error}</p>}
              </div>
            )}

            {transcript && (
              <div className="card transcript-card">
                <div className="section-header" style={{ marginBottom: 0 }}>
                  <h3>Transcript preview</h3>
                  <span className="count-pill">{transcript.length}</span>
                </div>
                <div className="transcript-list">
                  {transcript.length ? (
                    transcript.slice(0, 20).map((segment) => (
                      <p key={segment.id} className="transcript-segment">
                        <span className="timestamp-chip">
                          {segment.start_seconds !== null &&
                          segment.end_seconds !== null
                            ? `${segment.start_seconds}s–${segment.end_seconds}s:`
                            : "Time unavailable:"}
                        </span>
                        {segment.text}
                      </p>
                    ))
                  ) : (
                    <p className="note">No transcript segments available.</p>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon teal" aria-hidden="true">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <h2>2. Upload slides and past exams</h2>
          </div>

          <form className="form" onSubmit={uploadMaterial}>
            <div className="field">
              <label htmlFor="kind">Material kind</label>
              <select
                id="kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as typeof kind)
                }
              >
                {kinds.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="material">
                Document (or manual transcript fallback)
              </label>
              <div className="file-input-wrap">
                <input
                  id="material"
                  type="file"
                  required
                  accept={
                    kind === "slides"
                      ? ".pdf,.pptx"
                      : kind === "transcript"
                        ? ".txt,.md,.srt,.vtt"
                        : ".pdf,.txt,.md"
                  }
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
            </div>

            <button
              className="btn full"
              disabled={!file || uploading}
              type="submit"
            >
              {uploading ? "Uploading…" : "Upload material"}
            </button>
          </form>
        </div>
      </div>

      <section>
        <div className="section-header">
          <div className="section-title-group">
            <h2>Course materials</h2>
            <span className="count-pill">{materials.length}</span>
          </div>
        </div>

        {materials.length ? (
          <ul className="course-list">
            {materials.map((item) => {
              const statusClass =
                item.status === "ready"
                  ? "status-ready"
                  : item.status === "failed"
                    ? "status-failed"
                    : item.status === "processing"
                      ? "status-active"
                      : "";

              return (
                <li className="card material-card" key={item.id}>
                  <div className="material-info">
                    <span className="material-icon" aria-hidden="true">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="material-title-row">
                        <strong className="material-filename">
                          {item.file_name}
                        </strong>
                      </div>
                      {item.status === "failed" && item.error && (
                        <p className="error">{item.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="material-badges">
                    <span className="badge kind-badge">{item.kind}</span>
                    <span className={`badge ${statusClass}`}>
                      <span className="badge-dot" aria-hidden="true" />
                      {item.status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">
            <span className="empty-icon" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span>
              No materials yet. Upload your recording, slides and past exam above to get started.
            </span>
          </p>
        )}
      </section>
    </main>
  );
}
