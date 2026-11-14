"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuestionsWorkspace } from "@/components/course/questions-workspace";

export default function QuestionsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;
  const router = useRouter();

  return (
    <main className="page container">
      <nav className="page-nav">
        <Link href={`/courses/${id}`} className="btn secondary small">
          &larr; Course overview
        </Link>
        <Link href={`/courses/${id}?tab=materials`} className="btn secondary small">
          Materials &amp; transcript
        </Link>
        <Link href={`/courses/${id}?tab=knowledge`} className="btn secondary small">
          Knowledge graph
        </Link>
        <Link href={`/courses/${id}?tab=oral`} className="btn secondary small">
          Oral exam
        </Link>
      </nav>

      <div className="page-header">
        <span className="eyebrow">Question Traceability</span>
        <h1>Exam questions</h1>
        <p>
          Select any extracted question to inspect its ranked source excerpts
          from transcripts, slides, and study materials.
        </p>
      </div>

      <QuestionsWorkspace
        courseId={id}
        onStartOralExam={() => router.push(`/courses/${id}?tab=oral`)}
        onOpenMaterials={() => router.push(`/courses/${id}?tab=materials`)}
      />
    </main>
  );
}
