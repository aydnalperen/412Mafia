"use client";

import Link from "next/link";
import { MaterialsWorkspace } from "@/components/course/materials-workspace";

export default function MaterialsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;

  return (
    <main className="page container">
      <nav className="page-nav">
        <Link href={`/courses/${id}`} className="btn secondary small">
          &larr; Course overview
        </Link>
        <Link href={`/courses/${id}?tab=questions`} className="btn secondary small">
          Exam questions
        </Link>
        <Link href={`/courses/${id}?tab=knowledge`} className="btn secondary small">
          Knowledge graph
        </Link>
        <Link href={`/courses/${id}?tab=oral`} className="btn secondary small">
          Oral exam
        </Link>
      </nav>

      <div className="page-header">
        <span className="eyebrow">Materials &amp; Transcription</span>
        <h1>Course materials</h1>
        <p>
          Upload lecture recordings, transcripts, slides, past exams, and study
          guides for this course.
        </p>
      </div>

      <MaterialsWorkspace courseId={id} />
    </main>
  );
}
