"use client";

import { useEffect, useState } from "react";
import {
  apiErrorMessage, materialsApi, recordingsApi,
  type Material, type MaterialKind, type TranscriptSegment, type TranscriptionJob,
} from "@/lib/api";

const kinds: Array<{ value: Exclude<MaterialKind, "recording">; label: string }> = [
  { value: "transcript", label: "Transcript (fallback)" },
  { value: "slides", label: "Slides" },
  { value: "exam", label: "Past exam" },
  { value: "study", label: "Study material" },
];

export default function MaterialsPage({ params }: { params: { courseId: string } }) {
  const id = params.courseId;
  const [materials, setMaterials] = useState<Material[]>([]);
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [recording, setRecording] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Exclude<MaterialKind, "recording">>("transcript");
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
      .catch((cause) => { if (!cancelled) setError(apiErrorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    if (job.status === "ready" && job.output_material_id != null) {
      materialsApi.transcript(job.output_material_id)
        .then((items) => { if (!cancelled) setTranscript(items); })
        .catch((cause) => { if (!cancelled) setError(apiErrorMessage(cause)); });
      materialsApi.list(id).then((items) => { if (!cancelled) setMaterials(items); }).catch(() => {});
    } else if (job.status !== "failed") {
      const timer = setTimeout(() => {
        recordingsApi.job(job.id)
          .then((updated) => { if (!cancelled) setJob(updated); })
          .catch((cause) => { if (!cancelled) setError(apiErrorMessage(cause)); });
      }, 2000);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    return () => { cancelled = true; };
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
      setMaterials((items) => [item, ...items.filter((previous) => previous.id !== item.id)]);
      setFile(null);
      form.reset();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <main className="page"><h1>Materials</h1><p>Loading…</p></main>;

  return (
    <main className="page container">
      <a href={`/courses/${id}`}>Back to course</a>
      <h1>Materials</h1>
      {error && <p role="alert" className="error">{error}</p>}
      <form className="form" onSubmit={uploadRecording}>
        <h2>1. Upload a lecture recording</h2>
        <label htmlFor="recording">MP4 video or MP3 audio</label>
        <input id="recording" type="file" accept=".mp4,.mp3" required
          onChange={(event) => setRecording(event.target.files?.[0] ?? null)} />
        <button className="btn" disabled={!recording || uploading} type="submit">
          {uploading ? "Uploading…" : "Generate transcript"}
        </button>
        <p className="note">Processing requires the separate transcription worker. No video frames are analyzed.</p>
        {job && <div className="card" role="status">
          <strong>Transcription: {job.status.replaceAll("_", " ")} ({job.progress}%)</strong>
          {job.status === "failed" && <p className="error">{job.error}</p>}
        </div>}
        {transcript && <div className="card">
          <h3>Transcript preview</h3>
          {transcript.length ? transcript.slice(0, 20).map((segment) => <p key={segment.id}>
            {segment.start_seconds !== null && segment.end_seconds !== null
              ? `${segment.start_seconds}s–${segment.end_seconds}s: ` : "Time unavailable: "}
            {segment.text}
          </p>) : <p>No transcript segments available.</p>}
        </div>}
      </form>

      <form className="form" onSubmit={uploadMaterial}>
        <h2>2. Upload slides and past exams</h2>
        <label htmlFor="kind">Material kind</label>
        <select id="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          {kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label htmlFor="material">Document (or manual transcript fallback)</label>
        <input id="material" type="file" required
          accept={kind === "slides" ? ".pdf,.pptx" : kind === "transcript" ? ".txt,.md,.srt,.vtt" : ".pdf,.txt,.md"}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button className="btn" disabled={!file || uploading} type="submit">{uploading ? "Uploading…" : "Upload material"}</button>
      </form>

      <h2>Course materials</h2>
      {materials.length ? <ul className="course-list">
        {materials.map((item) => <li className="card" key={item.id}>
          <strong>{item.file_name}</strong> — {item.kind} ({item.status})
          {item.status === "failed" && item.error && <p className="error">{item.error}</p>}
        </li>)}
      </ul> : <p className="empty">No materials yet.</p>}
    </main>
  );
}
