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
      <main className="page">
        <h1>Courses</h1>
        <div className="loading">Loading courses…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <h1>Courses</h1>
        <div className="error">
          Failed to load courses:{" "}
          {error instanceof Error ? error.message : String(error)}
        </div>
      </main>
    );
  }

  return (
    <main className="page container">
      <h1>Courses</h1>

      <form onSubmit={handleCreate} className="form">
        <h2>Create course</h2>
        <label htmlFor="course-name">Name</label>
        <input
          id="course-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Multimedia Signal Processing"
        />
        <label htmlFor="course-description">Description</label>
        <textarea
          id="course-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional course description"
        />
        {createError !== null && (
          <div className="error">
            Failed to create course:{" "}
            {createError instanceof Error ? createError.message : String(createError)}
          </div>
        )}
        <button type="submit" className="btn" disabled={creating}>
          {creating ? "Creating…" : "Create course"}
        </button>
      </form>

      <h2>Your courses</h2>
      {courses.length === 0 ? (
        <div className="empty">
          No courses yet. Create one above to get started.
        </div>
      ) : (
        <ul className="course-list">
          {courses.map((course) => (
            <li key={course.id} className="course-item">
              <div>
                <h3>{course.name}</h3>
                {course.description && (
                  <p>{course.description}</p>
                )}
                <p className="course-meta">Created {new Date(
                  course.created_at
                ).toLocaleDateString()}</p>
              </div>
              <div className="actions">
                <a
                  href={`/courses/${course.id}`}
                  className="btn small secondary"
                >
                  Open
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
