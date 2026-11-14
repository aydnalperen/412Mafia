"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiErrorMessage,
  materialsApi,
  recordingsApi,
  type Material,
  type MaterialKind,
  type TranscriptSegment,
  type TranscriptionJob,
} from "@/lib/api";
import {
  formatTimestampRange,
  formatTranscriptParagraphs,
} from "@/lib/format";

const kinds: Array<{
  value: Exclude<MaterialKind, "recording">;
  label: string;
}> = [
  { value: "transcript", label: "Transcript (fallback)" },
  { value: "slides", label: "Slides" },
  { value: "exam", label: "Past exam" },
  { value: "study", label: "Study material" },
];

type UploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError";
}

export function MaterialsWorkspace({
  courseId,
  initialTranscriptMaterialId,
  onMaterialsChanged,
}: {
  courseId: string;
  initialTranscriptMaterialId?: string | number | null;
  onMaterialsChanged?: () => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [activeTranscriptMaterial, setActiveTranscriptMaterial] = useState<{
    id: string | number;
    fileName: string;
  } | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [showAllSegments, setShowAllSegments] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [recordings, setRecordings] = useState<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] =
    useState<Exclude<MaterialKind, "recording">>("transcript");
  const [loading, setLoading] = useState(true);
  const [recordingUpload, setRecordingUpload] = useState<UploadProgress | null>(
    null
  );
  const [materialUpload, setMaterialUpload] = useState<UploadProgress | null>(
    null
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | number | null>(
    null
  );
  const [removingId, setRemovingId] = useState<string | number | null>(null);

  const recordingInputRef = useRef<HTMLInputElement | null>(null);
  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const recordingAbortRef = useRef<AbortController | null>(null);
  const materialAbortRef = useRef<AbortController | null>(null);
  const transcriptSectionRef = useRef<HTMLElement | null>(null);
  const autoLoadedJobRef = useRef<string | number | null>(null);

  useEffect(() => {
    return () => {
      recordingAbortRef.current?.abort();
      materialAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([materialsApi.list(courseId), recordingsApi.list(courseId)])
      .then(([items, jobs]) => {
        if (cancelled) return;
        setMaterials(items);
        setJob(jobs[0] ?? null);
        if (initialTranscriptMaterialId != null) {
          const requested = items.find(
            (entry) =>
              String(entry.id) === String(initialTranscriptMaterialId) &&
              entry.kind === "transcript" &&
              entry.status === "ready"
          );
          if (requested) {
            setTranscriptLoading(true);
            materialsApi
              .transcript(requested.id)
              .then((segments) => {
                if (cancelled) return;
                setActiveTranscriptMaterial({
                  id: requested.id,
                  fileName: requested.file_name,
                });
                setTranscript(segments);
              })
              .catch(() => {})
              .finally(() => {
                if (!cancelled) setTranscriptLoading(false);
              });
          }
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
  }, [courseId, initialTranscriptMaterialId]);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    if (job.status === "ready" && job.output_material_id != null) {
      const outputId = job.output_material_id;
      const shouldAutoLoad =
        autoLoadedJobRef.current !== job.id &&
        initialTranscriptMaterialId == null;
      if (shouldAutoLoad) {
        autoLoadedJobRef.current = job.id;
        setTranscriptLoading(true);
        Promise.all([
          materialsApi.transcript(outputId),
          materialsApi.list(courseId),
        ])
          .then(([segments, items]) => {
            if (cancelled) return;
            setMaterials(items);
            const matched = items.find(
              (entry) => String(entry.id) === String(outputId)
            );
            setActiveTranscriptMaterial({
              id: outputId,
              fileName: matched?.file_name ?? "Lecture transcript",
            });
            setTranscript(segments);
            setTranscriptQuery("");
            setShowAllSegments(false);
            onMaterialsChanged?.();
          })
          .catch((cause) => {
            if (!cancelled) setError(apiErrorMessage(cause));
          })
          .finally(() => {
            if (!cancelled) setTranscriptLoading(false);
          });
      }
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
  }, [courseId, job?.id, job?.status, job?.progress, initialTranscriptMaterialId]);

  async function handleRemoveMaterial(item: Material) {
    if (removingId !== null) return;
    setRemovingId(item.id);
    setError(null);
    setStatusNotice(null);
    try {
      await materialsApi.remove(courseId, item.id);
      setMaterials((prev) => prev.filter((m) => m.id !== item.id));
      if (
        activeTranscriptMaterial &&
        String(activeTranscriptMaterial.id) === String(item.id)
      ) {
        setTranscript(null);
        setActiveTranscriptMaterial(null);
      }
      setConfirmRemoveId(null);
      setStatusNotice(`Removed "${item.file_name}" from course materials.`);
      onMaterialsChanged?.();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setRemovingId(null);
    }
  }

  async function openTranscript(material: Material) {
    if (transcriptLoading) return;
    setTranscriptLoading(true);
    setError(null);
    setCopiedTranscript(false);
    setTranscriptQuery("");
    setShowAllSegments(false);
    try {
      const segments = await materialsApi.transcript(material.id);
      setActiveTranscriptMaterial({
        id: material.id,
        fileName: material.file_name,
      });
      setTranscript(segments);
      requestAnimationFrame(() => {
        transcriptSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setTranscriptLoading(false);
    }
  }

  async function copyFullTranscript() {
    if (
      !transcript?.length ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    const text = transcript
      .map((segment) => formatTranscriptParagraphs(segment.text).join("\n\n"))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      // Clipboard write may be blocked by browser permissions
    }
  }

  async function uploadRecording(event: React.FormEvent) {
    event.preventDefault();
    if (!recordings.length || recordingUpload) return;
    const form = event.currentTarget as HTMLFormElement;
    const controller = new AbortController();
    recordingAbortRef.current = controller;
    setError(null);
    setStatusNotice(null);
    setTranscript(null);
    setActiveTranscriptMaterial(null);
    autoLoadedJobRef.current = null;

    try {
      let latestJob: TranscriptionJob | null = null;
      for (let i = 0; i < recordings.length; i += 1) {
        if (controller.signal.aborted) break;
        const item = recordings[i];
        setRecordingUpload({
          current: i + 1,
          total: recordings.length,
          fileName: item.name,
        });
        latestJob = await recordingsApi.upload(
          courseId,
          item,
          controller.signal
        );
        setJob(latestJob);
      }
      if (latestJob) {
        setMaterials(await materialsApi.list(courseId));
        onMaterialsChanged?.();
      }
      setRecordings([]);
      form.reset();
    } catch (cause) {
      if (isAbortError(cause)) {
        setStatusNotice("Recording upload cancelled.");
        materialsApi
          .list(courseId)
          .then((items) => {
            setMaterials(items);
            onMaterialsChanged?.();
          })
          .catch(() => {});
      } else {
        setError(apiErrorMessage(cause));
      }
    } finally {
      recordingAbortRef.current = null;
      setRecordingUpload(null);
    }
  }

  async function uploadMaterial(event: React.FormEvent) {
    event.preventDefault();
    if (!files.length || materialUpload) return;
    const form = event.currentTarget as HTMLFormElement;
    const controller = new AbortController();
    materialAbortRef.current = controller;
    setError(null);
    setStatusNotice(null);

    try {
      for (let i = 0; i < files.length; i += 1) {
        if (controller.signal.aborted) break;
        const selectedFile = files[i];
        setMaterialUpload({
          current: i + 1,
          total: files.length,
          fileName: selectedFile.name,
        });
        const item = await materialsApi.upload(
          courseId,
          { file: selectedFile, kind },
          controller.signal
        );
        setMaterials((items) => [
          item,
          ...items.filter((previous) => previous.id !== item.id),
        ]);
      }
      onMaterialsChanged?.();
      setFiles([]);
      form.reset();
    } catch (cause) {
      if (isAbortError(cause)) {
        setStatusNotice("Material upload cancelled.");
      } else {
        setError(apiErrorMessage(cause));
      }
    } finally {
      materialAbortRef.current = null;
      setMaterialUpload(null);
    }
  }

  function cancelRecordingUpload() {
    recordingAbortRef.current?.abort();
  }

  function cancelMaterialUpload() {
    materialAbortRef.current?.abort();
  }

  function removeSelectedRecording(index: number) {
    setRecordings((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && recordingInputRef.current) {
        recordingInputRef.current.value = "";
      }
      return next;
    });
  }

  function removeSelectedFile(index: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && materialInputRef.current) {
        materialInputRef.current.value = "";
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" aria-hidden="true" />
        <p style={{ margin: 0 }}>Loading materials…</p>
      </div>
    );
  }

  const jobBadgeClass =
    job?.status === "ready"
      ? "status-ready"
      : job?.status === "failed"
        ? "status-failed"
        : "status-active";

  const trimmedQuery = transcriptQuery.trim().toLowerCase();
  const hasTimestamps =
    transcript?.some(
      (segment) =>
        segment.start_seconds !== null && segment.end_seconds !== null
    ) ?? false;
  const totalWords =
    transcript?.reduce((sum, segment) => {
      const words = segment.text.trim().split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0) ?? 0;
  const filteredSegments = transcript
    ? trimmedQuery
      ? transcript.filter((segment) =>
          segment.text.toLowerCase().includes(trimmedQuery)
        )
      : transcript
    : [];
  const visibleSegments =
    showAllSegments || trimmedQuery
      ? filteredSegments
      : filteredSegments.slice(0, 20);

  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {statusNotice && !error && (
        <div className="callout-info" role="status">
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
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>{statusNotice}</span>
        </div>
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
                  ref={recordingInputRef}
                  id="recording"
                  type="file"
                  accept=".mp4,.mp3"
                  multiple
                  required={recordings.length === 0}
                  onChange={(event) => {
                    setRecordings(Array.from(event.target.files ?? []));
                    setStatusNotice(null);
                  }}
                />
              </div>
              {recordings.length > 0 && !recordingUpload && (
                <ul className="selected-files-list">
                  {recordings.map((item, index) => (
                    <li
                      key={`${item.name}-${item.size}-${index}`}
                      className="selected-file-chip"
                    >
                      <span className="selected-file-meta">
                        <span className="selected-file-name">{item.name}</span>
                        <span className="selected-file-size">
                          {formatBytes(item.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="chip-remove-btn"
                        aria-label={`Remove ${item.name} from upload queue`}
                        onClick={() => removeSelectedRecording(index)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {recordingUpload ? (
              <div className="upload-progress-banner" role="status">
                <div className="upload-progress-info">
                  <span className="spinner" aria-hidden="true" />
                  <span className="upload-progress-text">
                    Uploading {recordingUpload.current} of{" "}
                    {recordingUpload.total}: {recordingUpload.fileName}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn small danger-outline"
                  onClick={cancelRecordingUpload}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn full"
                disabled={recordings.length === 0}
                type="submit"
              >
                {recordings.length > 1
                  ? `Generate transcripts (${recordings.length})`
                  : "Generate transcript"}
              </button>
            )}

            <p className="note">
              Your upload is transcribed in the background. No video frames are
              analyzed.
            </p>

            {job && (
              <div className="card status-card" role="status">
                <div className="status-row">
                  <strong className="tabular">
                    Transcription: {job.status.replaceAll("_", " ")} (
                    {job.progress}%)
                  </strong>
                  <div className="actions">
                    <span className={`badge ${jobBadgeClass}`}>
                      <span className="badge-dot" aria-hidden="true" />
                      {job.status.replaceAll("_", " ")}
                    </span>
                  </div>
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
                  ref={materialInputRef}
                  id="material"
                  type="file"
                  multiple
                  required={files.length === 0}
                  accept={
                    kind === "slides"
                      ? ".pdf,.pptx"
                      : kind === "transcript"
                        ? ".txt,.md,.srt,.vtt"
                        : ".pdf,.txt,.md"
                  }
                  onChange={(event) => {
                    setFiles(Array.from(event.target.files ?? []));
                    setStatusNotice(null);
                  }}
                />
              </div>
              {files.length > 0 && !materialUpload && (
                <ul className="selected-files-list">
                  {files.map((item, index) => (
                    <li
                      key={`${item.name}-${item.size}-${index}`}
                      className="selected-file-chip"
                    >
                      <span className="selected-file-meta">
                        <span className="selected-file-name">{item.name}</span>
                        <span className="selected-file-size">
                          {formatBytes(item.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="chip-remove-btn"
                        aria-label={`Remove ${item.name} from upload queue`}
                        onClick={() => removeSelectedFile(index)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {materialUpload ? (
              <div className="upload-progress-banner" role="status">
                <div className="upload-progress-info">
                  <span className="spinner" aria-hidden="true" />
                  <span className="upload-progress-text">
                    Uploading {materialUpload.current} of{" "}
                    {materialUpload.total}: {materialUpload.fileName}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn small danger-outline"
                  onClick={cancelMaterialUpload}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn full"
                disabled={files.length === 0}
                type="submit"
              >
                {files.length > 1
                  ? `Upload materials (${files.length})`
                  : "Upload material"}
              </button>
            )}
          </form>
        </div>
      </div>

      {(transcript !== null || transcriptLoading) && (
        <section
          ref={transcriptSectionRef}
          className="card transcript-section"
          aria-label="Transcript preview"
        >
          <div className="transcript-toolbar">
            <div className="transcript-toolbar-title">
              <h2>Transcript preview</h2>
              {activeTranscriptMaterial && (
                <span className="meta-chip mono">
                  {activeTranscriptMaterial.fileName}
                </span>
              )}
              {transcript && (
                <>
                  <span className="count-pill">
                    {transcript.length}{" "}
                    {transcript.length === 1 ? "segment" : "segments"}
                  </span>
                  <span className="meta-chip tabular">
                    {totalWords.toLocaleString()} words
                  </span>
                  {!hasTimestamps && transcript.length > 0 && (
                    <span className="meta-chip">No timestamps</span>
                  )}
                </>
              )}
            </div>

            <div className="transcript-toolbar-actions">
              {transcript && transcript.length > 0 && (
                <>
                  <div className="transcript-search-box">
                    <svg
                      className="transcript-search-icon"
                      width="15"
                      height="15"
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
                    <input
                      type="text"
                      className="transcript-search-input"
                      aria-label="Filter transcript segments"
                      placeholder="Search transcript…"
                      value={transcriptQuery}
                      onChange={(event) => setTranscriptQuery(event.target.value)}
                    />
                    {trimmedQuery && (
                      <>
                        <span className="transcript-match-count">
                          {filteredSegments.length}{" "}
                          {filteredSegments.length === 1 ? "match" : "matches"}
                        </span>
                        <button
                          type="button"
                          className="transcript-search-clear"
                          aria-label="Clear transcript filter"
                          onClick={() => setTranscriptQuery("")}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => setTranscriptExpanded((prev) => !prev)}
                  >
                    {transcriptExpanded ? "Compact view" : "Expand view"}
                  </button>
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => void copyFullTranscript()}
                  >
                    {copiedTranscript ? "Copied" : "Copy text"}
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn small secondary"
                onClick={() => {
                  setTranscript(null);
                  setActiveTranscriptMaterial(null);
                  setTranscriptQuery("");
                }}
              >
                Close
              </button>
            </div>
          </div>

          {transcriptLoading ? (
            <div className="loading" style={{ marginTop: 18 }}>
              <span className="spinner" aria-hidden="true" />
              <span>Loading transcript…</span>
            </div>
          ) : transcript && visibleSegments.length > 0 ? (
            <>
              <div
                className={
                  transcriptExpanded
                    ? "transcript-segments expanded"
                    : "transcript-segments"
                }
              >
                {visibleSegments.map((segment) => {
                  const timeRange = formatTimestampRange(
                    segment.start_seconds,
                    segment.end_seconds
                  );
                  const paragraphs = formatTranscriptParagraphs(segment.text);

                  return (
                    <article
                      key={segment.id}
                      className="transcript-segment-row"
                    >
                      <div className="transcript-segment-rail">
                        <span className="transcript-segment-num">
                          Segment {segment.sequence + 1}
                        </span>
                        {timeRange && (
                          <span className="timestamp-chip">{timeRange}</span>
                        )}
                      </div>
                      <div className="transcript-paragraphs">
                        {paragraphs.map((paragraph, pIndex) => (
                          <p
                            key={`${segment.id}-p-${pIndex}`}
                            className="transcript-para"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>

              {!trimmedQuery && filteredSegments.length > 20 && (
                <div className="transcript-footer-actions">
                  <span className="note" style={{ margin: 0 }}>
                    Showing {visibleSegments.length} of {filteredSegments.length}{" "}
                    segments
                  </span>
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => setShowAllSegments((prev) => !prev)}
                  >
                    {showAllSegments
                      ? "Show first 20 segments"
                      : `Show all ${filteredSegments.length} segments`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="note" style={{ marginTop: 16 }}>
              {trimmedQuery
                ? `No transcript segments matched "${transcriptQuery}".`
                : "No transcript segments available."}
            </p>
          )}
        </section>
      )}

      <section>
        <div className="section-header">
          <div className="section-title-group">
            <h2>Course materials</h2>
            <span className="count-pill">{materials.length}</span>
          </div>
        </div>

        {materials.length ? (
          <ul className="course-list materials-cards-grid">
            {materials.map((item) => {
              const statusClass =
                item.status === "ready"
                  ? "status-ready"
                  : item.status === "failed"
                    ? "status-failed"
                    : item.status === "processing"
                      ? "status-active"
                      : "";
              const isTranscript =
                item.kind === "transcript" && item.status === "ready";
              const isActiveTranscript =
                isTranscript &&
                activeTranscriptMaterial !== null &&
                String(activeTranscriptMaterial.id) === String(item.id);

              return (
                <li
                  className={`card material-card${isActiveTranscript ? " is-active" : ""}`}
                  key={item.id}
                >
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
                    {isTranscript && (
                      <button
                        type="button"
                        className="btn small secondary"
                        disabled={transcriptLoading}
                        onClick={() => void openTranscript(item)}
                      >
                        {isActiveTranscript ? "Viewing" : "View transcript"}
                      </button>
                    )}
                    {confirmRemoveId === item.id ? (
                      <div className="inline-confirm-group">
                        <button
                          type="button"
                          className="btn small danger-outline"
                          disabled={removingId === item.id}
                          onClick={() => void handleRemoveMaterial(item)}
                        >
                          {removingId === item.id ? "Removing…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          className="btn small secondary"
                          disabled={removingId === item.id}
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn small danger-outline"
                        onClick={() => setConfirmRemoveId(item.id)}
                      >
                        Remove
                      </button>
                    )}
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
              No materials yet. Upload your recording, slides and past exam
              above to get started.
            </span>
          </p>
        )}
      </section>
    </>
  );
}
