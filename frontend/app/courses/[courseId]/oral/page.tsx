"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OralWorkspace } from "@/components/course/oral-workspace";

export default function OralExamPage({
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
        <Link href={`/courses/${id}?tab=questions`} className="btn secondary small">
          Exam questions
        </Link>
        <Link href={`/courses/${id}?tab=materials`} className="btn secondary small">
          Materials &amp; transcript
        </Link>
        <Link href={`/courses/${id}?tab=knowledge`} className="btn secondary small">
          Knowledge graph
        </Link>
      </nav>

      <div className="page-header">
        <span className="eyebrow">Practice &amp; Assessment</span>
        <h1>Oral exam</h1>
        <p>
          Practice defending your understanding across three formative follow-up
          turns with source-grounded feedback.
        </p>
      </div>

      <OralWorkspace
        courseId={id}
        onOpenQuestions={() => router.push(`/courses/${id}?tab=questions`)}
        onOpenMaterials={() => router.push(`/courses/${id}?tab=materials`)}
      />
    </main>
  );
}
