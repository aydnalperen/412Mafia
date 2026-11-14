"use client";

import Link from "next/link";
import { KnowledgeWorkspace } from "@/components/course/knowledge-workspace";

export default function KnowledgePage({
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
        <Link href={`/courses/${id}?tab=materials`} className="btn secondary small">
          Materials &amp; transcript
        </Link>
        <Link href={`/courses/${id}?tab=questions`} className="btn secondary small">
          Exam questions
        </Link>
        <Link href={`/courses/${id}?tab=oral`} className="btn secondary small">
          Oral exam
        </Link>
      </nav>

      <div className="page-header">
        <span className="eyebrow">Concept Map</span>
        <h1>Knowledge graph</h1>
        <p>
          Interactive visualization of course topics, linked source chunks,
          and related exam questions.
        </p>
      </div>

      <KnowledgeWorkspace courseId={id} />
    </main>
  );
}
