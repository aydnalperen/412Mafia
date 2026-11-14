"use client";

import { useEffect, useState } from "react";
import { coursesApi, type Course } from "@/lib/api";

export default function CoursePage({
  params,
}: {
  params: { courseId: string | string[] };
}) {
  const id = Array.isArray(params.courseId)
    ? params.courseId[0]
    : params.courseId;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    coursesApi
      .get(id)
      .then(setCourse)
      .catch((err) => {
        setError(err);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="page">
        <h1>Course</h1>
        <div className="loading">Loading course…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <h1>Course</h1>
        <div className="error">
          Failed to load course:{" "}
          {error instanceof Error ? error.message : String(error)}
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="page">
        <h1>Course</h1>
        <div className="empty">Course not found.</div>
      </main>
    );
  }

  return (
    <main className="page container">
      <h1>{course.name}</h1>
      <div className="card">
        <p className="note">Course ID: {course.id}</p>
        {course.description ? (
          <p>{course.description}</p>
        ) : (
          <p className="note">No description.</p>
        )}
        <p className="course-meta">Created {new Date(
          course.created_at
        ).toLocaleDateString()}</p>
      </div>
      <p className="note">
        <a href={`/courses/${course.id}/materials`} className="link">
          Course materials
        </a>{" "}
        &mdash; upload and view transcripts, slides, exams, and study materials.
      </p>
    </main>
  );
}
