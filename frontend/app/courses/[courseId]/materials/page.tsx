"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiErrorMessage,
  materialsApi,
  type Material,
  type MaterialKind,
} from "@/lib/api";

const KINDS: Array<{ value: MaterialKind; label: string }> = [
  { value: "transcript", label: "Transcript" },
  { value: "slides", label: "Slides" },
  { value: "exam", label: "Past exam" },
  { value: "study", label: "Study material" },
];

type SubmissionKey = {
  name: string;
  size: number;
  kind: MaterialKind;
};

export default function MaterialsPage({
  params,
}: {
  params: { courseId: string | string[] };
}) {
  const id = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MaterialKind>("transcript");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  // Blocks resubmitting the exact selection that just failed; cleared on reselection.
  const [lastSubmitted, setLastSubmitted] = useState<SubmissionKey | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMaterials(await materialsApi.list(id));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files ? e.target.files[0] : null);
    setUploadError(null);
    setLastSubmitted(null);
  };

  const resetSelection = () => {
    setFile(null);
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || uploading) return;
    const key: SubmissionKey = { name: file.name, size: file.size, kind };
    if (
      lastSubmitted &&
      lastSubmitted.name === key.name &&
      lastSubmitted.size === key.size &&
      lastSubmitted.kind === key.kind
    ) {
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const created = await materialsApi.upload(id, { file, kind });
      setMaterials((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      resetSelection();
      setLastSubmitted(null);
    } catch (err) {
      setUploadError(err);
      setLastSubmitted(key);
      resetSelection(); // force reselection before a retry
    } finally {
      setUploading(false);
    }
  };

  const message = (err: unknown) =>
    err instanceof Error ? err.message : String(err);

  if (loading) {
    return (
      <main className="page">
        <h1>Materials</h1>
        <div className="loading">Loading materials…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <h1>Materials</h1>
        <div className="error">
          Failed to load materials: {message(error)}
        </div>
        <button type="button" className="btn" onClick={() => void load()}>Retry</button>
      </main>
    );
  }

  return (
    <main className="page container">
      <h1>Materials</h1>
      <a href={`/courses/${id}`} className="btn small secondary">
        Back to course
      </a>

      <form onSubmit={handleSubmit} className="form">
        <h2>Upload material</h2>
        <label htmlFor="material-kind">Kind</label>
        <select
          id="material-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as MaterialKind)}
          disabled={uploading}
        >
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label htmlFor="material-file">File</label>
        <input
          id="material-file"
          type="file"
          accept={kind === "transcript" ? ".txt,.md,.srt,.vtt" : kind === "slides" ? ".pdf,.pptx" : ".pdf,.txt,.md"}
          ref={fileInput}
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploadError !== null && (
          <div className="error">
            Upload failed: {apiErrorMessage(uploadError)}
          </div>
        )}
        <button
          type="submit"
          className="btn"
          disabled={uploading || !file || !!lastSubmitted}
        >
          {uploading
            ? "Uploading…"
            : !!lastSubmitted
            ? "Select a file to retry"
            : "Upload"}
        </button>
      </form>

      <h2>Course materials</h2>
      {materials.length === 0 ? (
        <div className="empty">
          No materials yet. Upload a file above to get started.
        </div>
      ) : (
        <ul className="course-list">
          {materials.map((material) => (
            <li key={material.id} className="card">
              <h3>{material.file_name}</h3>
              <p className="course-meta">
                {material.kind} &middot; {material.status}
              </p>
              <p className="course-meta">
                Created {new Date(material.created_at).toLocaleString()}
              </p>
              {material.status === "failed" && material.error && (
                <div className="error">{material.error}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
