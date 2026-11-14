"use client";

import { useCallback, useEffect, useState } from "react";
import { coursesApi, type Course } from "@/lib/api";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCourses(await coursesApi.list());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const created = await coursesApi.create({ name, description });
      setCourses((prev) => [created, ...prev]);
      setName("");
      setDescription("");
    } catch (err) {
      setCreateError(err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <main className="page container">
        <div className="page-header">
          <span className="eyebrow">Workspace</span>
          <h1>Courses</h1>
        </div>
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading courses…</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page container">
        <div className="page-header">
          <span className="eyebrow">Workspace</span>
          <h1>Courses</h1>
        </div>
        <div className="error" role="alert">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            Failed to load courses:{" "}
            {error instanceof Error ? error.message : String(error)}
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="page container">
      <div className="page-header">
        <span className="eyebrow">Workspace</span>
        <h1>Courses</h1>
        <p className="page-subtitle">
          Evidence-based study workspaces for lecture recordings, slides, and past exams.
        </p>
      </div>

      <div className="courses-grid">
        <aside className="courses-sidebar">
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
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </span>
              <h2>Create course</h2>
            </div>
            <form onSubmit={handleCreate} className="form">
              <div className="field">
                <label htmlFor="course-name">Name</label>
                <input
                  id="course-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Multimedia Signal Processing"
                />
              </div>
              <div className="field">
                <label htmlFor="course-description">Description</label>
                <textarea
                  id="course-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional course description"
                />
              </div>
              {createError !== null && (
                <div className="error" role="alert">
                  <span>
                    Failed to create course:{" "}
                    {createError instanceof Error
                      ? createError.message
                      : String(createError)}
                  </span>
                </div>
              )}
              <button
                type="submit"
                className="btn full"
                disabled={creating}
              >
                {creating ? "Creating…" : "Create course"}
              </button>
            </form>
          </div>
        </aside>

        <section>
          <div className="section-header">
            <div className="section-title-group">
              <h2>Your courses</h2>
              <span className="count-pill">{courses.length}</span>
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="empty">
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
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
              </span>
              <span>No courses yet. Create one above to get started.</span>
            </div>
          ) : (
            <ul className="course-list">
              {courses.map((course) => (
                <li key={course.id} className="course-item">
                  <div className="course-item-main">
                    <h3>{course.name}</h3>
                    {course.description && <p>{course.description}</p>}
                    <p className="course-meta">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>
                        Created {new Date(course.created_at).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                  <div className="actions">
                    <a
                      href={`/courses/${course.id}`}
                      className="btn small secondary"
                    >
                      <span>Open</span>
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
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
