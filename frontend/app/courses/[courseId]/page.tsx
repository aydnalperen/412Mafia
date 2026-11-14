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
      <main className="page container">
        <div className="page-header">
          <span className="eyebrow">Course</span>
          <h1>Course</h1>
        </div>
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading course…</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page container">
        <div className="page-nav">
          <a href="/courses" className="back-link">
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
            <span>All courses</span>
          </a>
        </div>
        <div className="page-header">
          <span className="eyebrow">Course</span>
          <h1>Course</h1>
        </div>
        <div className="error" role="alert">
          <span>
            Failed to load course:{" "}
            {error instanceof Error ? error.message : String(error)}
          </span>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="page container">
        <div className="page-nav">
          <a href="/courses" className="back-link">
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
            <span>All courses</span>
          </a>
        </div>
        <div className="page-header">
          <span className="eyebrow">Course</span>
          <h1>Course</h1>
        </div>
        <div className="empty">Course not found.</div>
      </main>
    );
  }

  return (
    <main className="page container">
      <div className="page-nav">
        <a href="/courses" className="back-link">
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
          <span>All courses</span>
        </a>
      </div>

      <div className="card course-hero-card">
        <div className="course-hero-meta">
          <span className="meta-chip mono">Course ID: {course.id}</span>
          <span className="meta-chip">
            <svg
              width="12"
              height="12"
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
            Created {new Date(course.created_at).toLocaleDateString()}
          </span>
        </div>

        <h1>{course.name}</h1>

        {course.description ? (
          <p className="course-description">{course.description}</p>
        ) : (
          <p className="note">No description.</p>
        )}
      </div>

      <div className="action-grid">
        <a href={`/courses/${course.id}/materials`} className="btn action-tile">
          <span className="action-tile-inner">
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
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload video, slides and past exams</span>
          </span>
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
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>

        <a
          href={`/courses/${course.id}/questions`}
          className="btn secondary action-tile"
        >
          <span className="action-tile-inner">
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
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>Exam questions and sources</span>
          </span>
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
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>

      <div className="callout-info">
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
        <p className="note" style={{ margin: 0 }}>
          Choose your own files on the next page; no course materials are preloaded.
        </p>
      </div>
    </main>
  );
}
